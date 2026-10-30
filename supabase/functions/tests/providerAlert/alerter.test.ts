import { describe, expect, it, vi } from 'vitest';
import {
  type AlertKind,
  type AlertProvider,
  createProviderAlerter,
  createProviderMonitor,
  createSlackPoster,
  createSupabaseAlertStore,
  hourOf,
  type ProviderAlertStore,
  type ProviderFailure,
  withProviderAlert,
} from '../../_shared/providerAlert.ts';
import { GEMINI_402_BODY } from './fixtures.ts';

// provider_alert 테이블을 흉내 낸다: 기본키 (provider, kind, hour), recovered_at
const fakeStore = () => {
  const rows = new Map<
    string,
    { provider: AlertProvider; kind: AlertKind; hour: string; recovered_at: string | null }
  >();
  const keyOf = (p: string, k: string, h: string) => `${p}|${k}|${h}`;
  const store: ProviderAlertStore = {
    claim: vi.fn(async (provider, kind, hour) => {
      const key = keyOf(provider, kind, hour);
      if (rows.has(key)) return false;
      rows.set(key, { provider, kind, hour, recovered_at: null });
      return true;
    }),
    unclaim: vi.fn(async (provider, kind, hour) => {
      rows.delete(keyOf(provider, kind, hour));
    }),
    resolve: vi.fn(async (provider, since, now) => {
      const kinds: AlertKind[] = [];
      for (const row of rows.values()) {
        if (
          row.provider === provider &&
          (row.kind === 'billing' || row.kind === 'auth') &&
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

describe('notifyProviderFailure 중복 방지', () => {
  it('같은 (provider, kind)는 1시간에 한 번만 Slack에 보낸다', async () => {
    const t = setup();
    for (let i = 0; i < 20; i++) await t.alerter.notifyProviderFailure(failure());

    expect(t.postSlack).toHaveBeenCalledTimes(1);
    expect(t.postSlack.mock.calls[0][0]).toContain('[Gemini] 결제·크레딧 문제');
    // 같은 isolate에서는 메모리로 먼저 걸러 DB insert도 한 번만
    expect(t.store.claim).toHaveBeenCalledTimes(1);
    expect(t.store.claim).toHaveBeenCalledWith('gemini', 'billing', '2026-10-30T10:00:00.000Z');
  });

  it('다른 isolate가 이미 차지했으면(insert 충돌) 보내지 않는다', async () => {
    const t = setup();
    await t.store.claim('gemini', 'billing', '2026-10-30T10:00:00.000Z');
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).not.toHaveBeenCalled();
  });

  it('kind·provider가 다르거나 다음 시간이 되면 다시 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    await t.alerter.notifyProviderFailure(failure({ kind: 'outage', status: 503 }));
    await t.alerter.notifyProviderFailure(failure({ provider: 'pixabay' }));
    expect(t.postSlack).toHaveBeenCalledTimes(3);

    t.advance(HOUR);
    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(4);
  });

  it('Slack 전송이 실패하면 차지를 되돌려 다음 실패가 다시 알린다', async () => {
    const t = setup();
    t.postSlack.mockRejectedValueOnce(new Error('timeout'));

    await expect(t.alerter.notifyProviderFailure(failure())).resolves.toBeUndefined();
    expect(t.store.unclaim).toHaveBeenCalledWith('gemini', 'billing', '2026-10-30T10:00:00.000Z');
    expect(t.rows.size).toBe(0);

    await t.alerter.notifyProviderFailure(failure());
    expect(t.postSlack).toHaveBeenCalledTimes(2);
  });

  it('저장소가 오류면(마이그레이션 미적용 등) isolate 메모리 기준으로만 걸러 보낸다', async () => {
    const t = setup();
    vi.mocked(t.store.claim).mockRejectedValue(
      new Error('relation "provider_alert" does not exist')
    );

    await t.alerter.notifyProviderFailure(failure());
    await t.alerter.notifyProviderFailure(failure());

    expect(t.postSlack).toHaveBeenCalledTimes(1);
    expect(t.log).toHaveBeenCalled();
  });

  it('무엇이 실패해도 던지지 않는다', async () => {
    const t = setup();
    vi.mocked(t.store.claim).mockRejectedValue(new Error('db'));
    t.postSlack.mockRejectedValue(new Error('slack'));
    vi.mocked(t.store.unclaim).mockRejectedValue(new Error('db'));

    await expect(t.alerter.notifyProviderFailure(failure())).resolves.toBeUndefined();
  });
});

describe('notifyProviderSuccess 복구 알림', () => {
  it('billing 알림 뒤 성공하면 복구 메시지를 한 번 보낸다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    t.advance(10 * MIN);

    await t.alerter.notifyProviderSuccess('gemini', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(2);
    expect(t.postSlack.mock.calls[1][0]).toContain('✅ [Gemini] 복구됨: food-check');

    t.advance(10 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(2);
  });

  it('알림이 없었거나 outage뿐이면 복구 메시지를 보내지 않는다', async () => {
    const t = setup();
    await t.alerter.notifyProviderSuccess('gemini', 'food-check');
    await t.alerter.notifyProviderFailure(failure({ kind: 'outage', status: 503 }));
    t.advance(10 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('24시간이 지난 알림은 복구 대상이 아니다', async () => {
    const t = setup();
    await t.alerter.notifyProviderFailure(failure());
    t.advance(25 * HOUR);
    await t.alerter.notifyProviderSuccess('gemini', 'food-check');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('성공마다 DB를 보지 않도록 isolate당 5분에 한 번만 확인한다', async () => {
    const t = setup();
    for (let i = 0; i < 10; i++) await t.alerter.notifyProviderSuccess('gemini', 'x');
    expect(t.store.resolve).toHaveBeenCalledTimes(1);
    t.advance(5 * MIN);
    await t.alerter.notifyProviderSuccess('gemini', 'x');
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
    expect(m.alerter.notifyProviderSuccess).toHaveBeenCalledWith('pixabay', 'food-check');
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
    for (const name of ['insert', 'delete', 'update', 'eq', 'in', 'is', 'gte', 'select']) {
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
      },
    };
  };

  it('insert 성공이면 차지, 기본키 충돌(23505)이면 차지 못함, 그 밖의 오류는 던진다', async () => {
    const ok = fakeClient({ error: null });
    await expect(createSupabaseAlertStore(ok.client).claim('gemini', 'billing', 'H')).resolves.toBe(
      true
    );
    expect(ok.calls).toEqual([
      ['from', ['provider_alert']],
      ['insert', [{ provider: 'gemini', kind: 'billing', hour: 'H' }]],
    ]);

    const dup = fakeClient({ error: { code: '23505', message: 'duplicate key' } });
    await expect(
      createSupabaseAlertStore(dup.client).claim('gemini', 'billing', 'H')
    ).resolves.toBe(false);

    const broken = fakeClient({ error: { code: '42P01', message: 'missing table' } });
    await expect(
      createSupabaseAlertStore(broken.client).claim('gemini', 'billing', 'H')
    ).rejects.toThrow('missing table');
  });

  it('resolve는 24시간 안의 복구 안 된 billing·auth 행을 update ... returning으로 차지한다', async () => {
    const f = fakeClient({ data: [{ kind: 'billing' }], error: null });
    await expect(
      createSupabaseAlertStore(f.client).resolve('gemini', 'SINCE', 'NOW')
    ).resolves.toEqual(['billing']);
    expect(f.calls).toEqual([
      ['from', ['provider_alert']],
      ['update', [{ recovered_at: 'NOW' }]],
      ['eq', ['provider', 'gemini']],
      ['in', ['kind', ['billing', 'auth']]],
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
