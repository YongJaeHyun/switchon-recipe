import { describe, expect, it, vi } from 'vitest';
import {
  ALERT_TASK_TIMEOUT_MS,
  type AlertKind,
  type AlertSlot,
  createProviderAlertMonitor,
  createProviderAlerter,
  createProviderMonitor,
  createSlackPoster,
  createSupabaseAlertStore,
  hourOf,
  type ProviderAlertStore,
  type ProviderFailure,
  runInBackground,
  withProviderAlert,
  withTimeout,
} from '../../_shared/providerAlert.ts';
import { GEMINI_402_BODY } from './fixtures.ts';

// provider_alert 테이블 + record_provider_failure RPC를 흉내 낸다
// 기본키 (provider, model, kind, hour), fail_count, alerted_at, recovered_at
type Row = AlertSlot & {
  fail_count: number;
  alerted_at: string | null;
  recovered_at: string | null;
};
const fakeStore = () => {
  const rows = new Map<string, Row>();
  const keyOf = (s: AlertSlot) => `${s.provider}|${s.model}|${s.kind}|${s.hour}`;
  const store: ProviderAlertStore = {
    recordFailure: vi.fn(async (slot, threshold) => {
      const key = keyOf(slot);
      const row = rows.get(key);
      if (!row) {
        rows.set(key, { ...slot, fail_count: 1, alerted_at: null, recovered_at: null });
      } else if (row.recovered_at !== null) {
        Object.assign(row, { fail_count: 1, alerted_at: null, recovered_at: null });
      } else {
        row.fail_count += 1;
      }
      const current = rows.get(key)!;
      if (current.alerted_at !== null || current.fail_count < threshold) return false;
      current.alerted_at = 'now';
      return true;
    }),
    releaseAlert: vi.fn(async (slot) => {
      const row = rows.get(keyOf(slot));
      if (row) row.alerted_at = null;
    }),
    resolve: vi.fn(async (provider, model, since, now) => {
      const kinds: AlertKind[] = [];
      for (const row of rows.values()) {
        if (
          row.provider === provider &&
          row.model === model &&
          (row.kind === 'billing' || row.kind === 'auth') &&
          row.alerted_at !== null &&
          row.recovered_at === null &&
          row.hour >= since
        ) {
          row.recovered_at = now;
          kinds.push(row.kind);
        }
      }
      return kinds;
    }),
  };
  return { store, rows };
};

const failure = (over: Partial<ProviderFailure> = {}): ProviderFailure => ({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  kind: 'billing',
  functionName: 'create-recipe-by-gemini',
  status: 402,
  detail: 'Your prepayment credits are depleted.',
  ...over,
});

const setup = (start = '2026-10-30T10:15:00Z') => {
  let now = new Date(start);
  const { store, rows } = fakeStore();
  const postSlack = vi.fn(async (_text: string) => {});
  const log = vi.fn();
  const alerter = createProviderAlerter({ store, postSlack, now: () => now, log });
  return {
    alerter,
    store,
    rows,
    postSlack,
    log,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

describe('hourOf', () => {
  it('시간 단위로 내린 ISO 문자열', () => {
    expect(hourOf(new Date('2026-10-30T10:59:59.999Z'))).toBe('2026-10-30T10:00:00.000Z');
  });
});

const H10 = '2026-10-30T10:00:00.000Z';
const slot = (over: Partial<AlertSlot> = {}): AlertSlot => ({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  kind: 'billing',
  hour: H10,
  ...over,
});
const outage = (over: Partial<ProviderFailure> = {}) =>
  failure({
    kind: 'outage',
    status: 503,
    detail: 'UNAVAILABLE: The model is overloaded.',
    ...over,
  });

describe('notifyProviderFailure 중복 방지', () => {
  it('같은 (provider, model, kind)는 1시간에 한 번만 Slack에 보낸다', async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) await t.alerter.notifyProviderFailure(failure());

    expect(t.postSlack).toHaveBeenCalledTimes(1);
    expect(t.postSlack.mock.calls[0][0]).toContain('[Gemini] 결제·크레딧 문제');
    expect(t.postSlack.mock.calls[0][0]).toContain('모델: gemini-2.5-flash');
    expect(t.store.recordFailure).toHaveBeenCalledWith(slot(), 1);
  });

  it('다른 isolate가 이미 알렸으면 보내지 않는다', async () => {
    const t = setup();
    await t.store.recordFailure(slot(), 1);
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).not.toHaveBeenCalled();
  });

  it('kind·provider·model이 다르거나 다음 시간이 되면 다시 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    await t.alerter.notifyProviderFailure(failure({ kind: 'auth', status: 401 }));
    await t.alerter.notifyProviderFailure(failure({ provider: 'pixabay', model: '' }));
    await t.alerter.notifyProviderFailure(failure({ model: 'gemini-3-pro-image-preview' }));
    expect(t.postSlack).toHaveBeenCalledTimes(4);

    t.advance(HOUR);
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(5);
  });

  it('Slack 전송이 실패하면 차지를 되돌려 다음 실패가 다시 알린다', async () => {
    const t = setup();
    t.postSlack.mockRejectedValueOnce(new Error('timeout'));

    await expect(t.alerter.notifyProviderFailure(failure())).resolves.toBeUndefined();
    expect(t.store.releaseAlert).toHaveBeenCalledWith(slot());

    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(2);
  });

  it('저장소가 오류면(마이그레이션 미적용 등) isolate 메모리 기준으로만 걸러 보낸다', async () => {
    const t = setup();
    vi.mocked(t.store.recordFailure).mockRejectedValue(
      new Error('function record_provider_failure does not exist')
    );

    await t.alerter.notifyProviderFailure(failure());
    await t.alerter.notifyProviderFailure(failure());
    for (let i = 0; i < 2; i++) await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).toHaveBeenCalledTimes(1);
    await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).toHaveBeenCalledTimes(2);
    expect(t.log).toHaveBeenCalled();
  });

  it('무엇이 실패해도 던지지 않는다', async () => {
    const t = setup();
    vi.mocked(t.store.recordFailure).mockRejectedValue(new Error('db'));
    t.postSlack.mockRejectedValue(new Error('slack'));
    vi.mocked(t.store.releaseAlert).mockRejectedValue(new Error('db'));

    await expect(t.alerter.notifyProviderFailure(failure())).resolves.toBeUndefined();
  });
});

describe('outage는 1시간에 3번 실패해야 알린다', () => {
  it('503 한두 번은 보내지 않고 3번째에 한 번 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(outage());
    await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).not.toHaveBeenCalled();
    expect(t.store.recordFailure).toHaveBeenCalledWith(slot({ kind: 'outage' }), 3);

    await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).toHaveBeenCalledTimes(1);
    expect(t.postSlack.mock.calls[0][0]).toContain('1시간 안에 3번 실패');

    for (let i = 0; i < 10; i++) await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('횟수는 시간·모델마다 따로 센다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(outage());
    await t.alerter.notifyProviderFailure(outage());
    await t.alerter.notifyProviderFailure(outage({ model: 'gemini-3-pro-image-preview' }));
    t.advance(HOUR);
    await t.alerter.notifyProviderFailure(outage());
    expect(t.postSlack).not.toHaveBeenCalled();
  });

  it('billing·auth·model은 첫 실패에 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    await t.alerter.notifyProviderFailure(failure({ kind: 'auth', status: 401 }));
    await t.alerter.notifyProviderFailure(failure({ kind: 'model', status: 404 }));
    expect(t.postSlack).toHaveBeenCalledTimes(3);
  });
});

describe('notifyProviderSuccess 복구 알림', () => {
  it('billing 알림 뒤 같은 모델이 성공하면 복구 메시지를 한 번 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    t.advance(10 * MIN);

    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(2);
    expect(t.postSlack.mock.calls[1][0]).toContain(
      '✅ [Gemini] 복구됨: food-check 호출(gemini-2.5-flash)'
    );

    t.advance(10 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(2);
  });

  it('다른 모델의 성공은 복구로 치지 않는다 (텍스트 성공 ≠ 이미지 복구)', async () => {
    const t = setup();
    const image = 'gemini-3-pro-image-preview';
    await t.alerter.notifyProviderFailure(failure({ model: image, status: 429 }));
    t.advance(10 * MIN);

    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'create-recipe-by-gemini');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
    expect(t.store.resolve).toHaveBeenCalledWith(
      'gemini',
      'gemini-2.5-flash',
      expect.any(String),
      expect.any(String)
    );

    // 모델마다 확인 간격을 따로 둬서 바로 이미지 모델 성공도 본다
    await t.alerter.notifyProviderSuccess('gemini', image, 'create-recipe-by-gemini');
    expect(t.postSlack).toHaveBeenCalledTimes(2);
    expect(t.postSlack.mock.calls[1][0]).toContain(image);
  });

  it('복구 뒤 같은 시간에 다시 실패하면 또 알린다 (같은 isolate에서도)', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    t.advance(10 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(2);

    t.advance(10 * MIN);
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(3);
    expect(t.postSlack.mock.calls[2][0]).toContain('🚨 [Gemini] 결제·크레딧 문제');

    // 다시 차지한 뒤로는 그 시간 안 중복을 또 막는다
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(3);
  });

  it('알림이 없었거나 outage뿐이면 복구 메시지를 보내지 않는다', async () => {
    const t = setup();
    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    for (let i = 0; i < 3; i++) await t.alerter.notifyProviderFailure(outage());
    t.advance(10 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('24시간이 지난 알림은 복구 대상이 아니다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    t.advance(25 * HOUR);
    await t.alerter.notifyProviderSuccess('gemini', 'gemini-2.5-flash', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('성공마다 DB를 보지 않도록 isolate당 모델별 5분에 한 번만 확인한다', async () => {
    const t = setup();
    for (let i = 0; i < 10; i++) await t.alerter.notifyProviderSuccess('gemini', 'm', 'x');
    expect(t.store.resolve).toHaveBeenCalledTimes(1);
    t.advance(5 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'm', 'x');
    expect(t.store.resolve).toHaveBeenCalledTimes(2);
  });
});

describe('createProviderMonitor / withProviderAlert', () => {
  const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=SECRET';

  const monitorSetup = () => {
    const tasks: Promise<unknown>[] = [];
    const alerter = {
      notifyProviderFailure: vi.fn(async () => {}),
      notifyProviderSuccess: vi.fn(async () => {}),
    };
    const monitor = createProviderMonitor({
      functionName: 'food-check',
      alerter,
      schedule: (task) => tasks.push(task),
    });
    return { alerter, monitor, flush: () => Promise.all(tasks) };
  };

  it('402 응답을 분류해 알리고, 호출부는 같은 응답 본문을 그대로 읽는다', async () => {
    const m = monitorSetup();
    const fetchFn = withProviderAlert(
      vi.fn(async () => new Response(GEMINI_402_BODY, { status: 402 })) as unknown as typeof fetch,
      m.monitor
    );

    const res = await fetchFn(GEMINI_URL, { method: 'POST' });
    expect(res.status).toBe(402);
    expect(await res.text()).toBe(GEMINI_402_BODY);
    await m.flush();

    expect(m.alerter.notifyProviderFailure).toHaveBeenCalledWith({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      kind: 'billing',
      functionName: 'food-check',
      status: 402,
      detail: expect.stringContaining('Your prepayment credits are depleted'),
    });
  });

  it('알릴 필요 없는 실패(400 요청 오류), Gemini·Pixabay가 아닌 URL은 무시한다', async () => {
    const m = monitorSetup();
    m.monitor.observe(
      GEMINI_URL,
      new Response('{"error":{"status":"INVALID_ARGUMENT"}}', { status: 400 })
    );
    m.monitor.observe('https://hooks.slack.com/x', new Response('', { status: 500 }));
    await m.flush();
    expect(m.alerter.notifyProviderFailure).not.toHaveBeenCalled();
    expect(m.alerter.notifyProviderSuccess).not.toHaveBeenCalled();
  });

  it('성공 응답은 복구 확인으로 넘긴다', async () => {
    const m = monitorSetup();
    m.monitor.observe('https://pixabay.com/api/?key=x', new Response('{}', { status: 200 }));
    await m.flush();
    expect(m.alerter.notifyProviderSuccess).toHaveBeenCalledWith('pixabay', '', 'food-check');
  });

  it('Gemini 성공은 URL의 모델로 복구를 확인한다', async () => {
    const m = monitorSetup();
    m.monitor.observe(GEMINI_URL, new Response('{}', { status: 200 }));
    await m.flush();
    expect(m.alerter.notifyProviderSuccess).toHaveBeenCalledWith(
      'gemini',
      'gemini-2.5-flash',
      'food-check'
    );
  });

  it('네트워크 오류·시간 초과는 그대로 던지고 알리지 않는다', async () => {
    const m = monitorSetup();
    const fetchFn = withProviderAlert(
      vi.fn(async () => {
        throw new Error('The signal has been aborted');
      }) as unknown as typeof fetch,
      m.monitor
    );
    await expect(fetchFn(GEMINI_URL)).rejects.toThrow('aborted');
    await m.flush();
    expect(m.alerter.notifyProviderFailure).not.toHaveBeenCalled();
  });

  it('알림이 오래 걸려도 응답은 바로 돌려준다 (백그라운드)', async () => {
    const tasks: Promise<unknown>[] = [];
    const never = new Promise<void>(() => {});
    const monitor = createProviderMonitor({
      functionName: 'f',
      alerter: { notifyProviderFailure: () => never, notifyProviderSuccess: () => never },
      schedule: (task) => tasks.push(task),
    });
    const fetchFn = withProviderAlert(
      (async () => new Response(GEMINI_402_BODY, { status: 402 })) as unknown as typeof fetch,
      monitor
    );
    await expect(fetchFn(GEMINI_URL)).resolves.toHaveProperty('status', 402);
  });
});

describe('createSupabaseAlertStore', () => {
  // supabase-js 쿼리 빌더 흉내: 체인 호출을 기록하고 마지막에 result로 resolve
  const fakeClient = (result: {
    data?: unknown;
    error: { code?: string; message: string } | null;
  }) => {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const name of ['update', 'eq', 'in', 'is', 'not', 'gte', 'select']) {
      builder[name] = (...args: unknown[]) => {
        calls.push([name, args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    return {
      calls,
      client: {
        from: (table: string) => {
          calls.push(['from', [table]]);
          return builder;
        },
        rpc: (fn: string, args: Record<string, unknown>) => {
          calls.push(['rpc', [fn, args]]);
          return Promise.resolve(result);
        },
      },
    };
  };

  it('recordFailure는 record_provider_failure RPC로 세고, true일 때만 차지, 오류는 던진다', async () => {
    const ok = fakeClient({ data: true, error: null });
    await expect(createSupabaseAlertStore(ok.client).recordFailure(slot(), 3)).resolves.toBe(true);
    expect(ok.calls).toEqual([
      [
        'rpc',
        [
          'record_provider_failure',
          {
            p_provider: 'gemini',
            p_model: 'gemini-2.5-flash',
            p_kind: 'billing',
            p_hour: H10,
            p_threshold: 3,
          },
        ],
      ],
    ]);

    const no = fakeClient({ data: false, error: null });
    await expect(createSupabaseAlertStore(no.client).recordFailure(slot(), 1)).resolves.toBe(false);

    const broken = fakeClient({ error: { code: '42883', message: 'missing function' } });
    await expect(createSupabaseAlertStore(broken.client).recordFailure(slot(), 1)).rejects.toThrow(
      'missing function'
    );
  });

  it('releaseAlert는 그 행의 alerted_at만 비운다', async () => {
    const f = fakeClient({ error: null });
    await createSupabaseAlertStore(f.client).releaseAlert(slot());
    expect(f.calls).toEqual([
      ['from', ['provider_alert']],
      ['update', [{ alerted_at: null }]],
      ['eq', ['provider', 'gemini']],
      ['eq', ['model', 'gemini-2.5-flash']],
      ['eq', ['kind', 'billing']],
      ['eq', ['hour', H10]],
    ]);
  });

  it('resolve는 같은 모델의 24시간 안 알린·복구 안 된 billing·auth 행을 update ... returning으로 차지한다', async () => {
    const f = fakeClient({ data: [{ kind: 'billing' }], error: null });
    await expect(
      createSupabaseAlertStore(f.client).resolve('gemini', 'gemini-2.5-flash', 'SINCE', 'NOW')
    ).resolves.toEqual(['billing']);
    expect(f.calls).toEqual([
      ['from', ['provider_alert']],
      ['update', [{ recovered_at: 'NOW' }]],
      ['eq', ['provider', 'gemini']],
      ['eq', ['model', 'gemini-2.5-flash']],
      ['in', ['kind', ['billing', 'auth']]],
      ['not', ['alerted_at', 'is', null]],
      ['is', ['recovered_at', null]],
      ['gte', ['hour', 'SINCE']],
      ['select', ['kind']],
    ]);
  });
});

describe('createSlackPoster', () => {
  it('{ text }를 POST하고 시간 제한 signal을 단다', async () => {
    const fetchFn = vi.fn(async () => new Response('ok'));
    await createSlackPoster('https://hooks.slack.com/x', fetchFn as unknown as typeof fetch)('hi');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/x');
    expect(init.body).toBe(JSON.stringify({ text: 'hi' }));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('웹훅 URL이 없거나 실패 응답이면 던진다 (알림 본체가 잡아 로그만 남긴다)', async () => {
    await expect(createSlackPoster(undefined)('hi')).rejects.toThrow('SLACK_WEBHOOK_URL');
    const fetchFn = vi.fn(async () => new Response('no', { status: 404 }));
    await expect(
      createSlackPoster('https://x', fetchFn as unknown as typeof fetch)('hi')
    ).rejects.toThrow('404');
  });
});

describe('Slack 오류 로그에 웹훅 URL을 남기지 않는다', () => {
  it('네트워크 오류 메시지(URL 포함)를 오류 이름만 남긴 메시지로 바꾼다', async () => {
    const url = 'https://hooks.slack.com/services/T000/B000/SECRET';
    const fetchFn = vi.fn(async () => {
      throw new TypeError(`error sending request for url (${url})`);
    });
    const error = await createSlackPoster(
      url,
      fetchFn as unknown as typeof fetch
    )('hi').catch((e: Error) => e);
    expect((error as Error).message).toBe('Slack 전송 실패 (TypeError)');
    expect((error as Error).message).not.toContain('SECRET');
  });
});

describe('SLACK_WEBHOOK_URL이 없으면 아무것도 하지 않는다', () => {
  it('DB를 건드리지 않고 Slack도 부르지 않는다', async () => {
    const client = { from: vi.fn(), rpc: vi.fn() };
    const fetchFn = vi.fn(async () => new Response('ok'));
    const monitor = createProviderAlertMonitor({
      functionName: 'food-check',
      client,
      webhookUrl: undefined,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const GEMINI =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    monitor.observe(GEMINI, new Response(GEMINI_402_BODY, { status: 402 }));
    monitor.observe(GEMINI, new Response('{}', { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('백그라운드 알림 작업 시간 제한', () => {
  it('withTimeout은 제한 시간이 지나면 거절하고, runInBackground는 그 오류를 삼킨다', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<void>(() => {});
      const raced = withTimeout(never, ALERT_TASK_TIMEOUT_MS);
      const settled = raced.catch((e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(ALERT_TASK_TIMEOUT_MS);
      await expect(settled).resolves.toContain('시간 초과');
      expect(ALERT_TASK_TIMEOUT_MS).toBe(5000);

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      runInBackground(never);
      await vi.advanceTimersByTimeAsync(ALERT_TASK_TIMEOUT_MS);
      expect(errorSpy).toHaveBeenCalledWith(
        '[providerAlert] 백그라운드 작업 실패:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
