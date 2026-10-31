import { describe, expect, it, vi } from 'vitest';
import type { WeekData, WeeklyReportRow } from '../../_shared/weeklyReportGenerate.ts';
import {
  CREATE_DAILY_LIMIT,
  handleGenerateMyReport,
  type MyReportDeps,
  type MyReportRow,
} from '../../generate-my-report/handler.ts';

// 2026-10-16(금) 12:00 KST. 시작일 10-01 → 1주차(10-01~10-07)·2주차(10-08~10-14) 끝남, 3주차 중
const NOW = new Date('2026-10-16T03:00:00Z');
const START = '2026-10-01';
const UID = 'u1';
const TODAY_START_ISO = '2026-10-15T15:00:00.000Z'; // 10-16 00:00 KST

const filledWeek = (): WeekData => ({
  weights: [
    { day: '2026-10-08', weight_kg: 70 },
    { day: '2026-10-14', weight_kg: 69 },
  ],
  todoDays: [{ day: '2026-10-09', items: ['아침 쉐이크 마시기'], checked: [0] }],
  fastingPlanDays: null,
  fastingPlanStartTime: null,
  fastingPlanStartMinutes: null,
  fastingResults: [],
  recipes: [],
  foodChecks: [],
});

const emptyWeek = (): WeekData => ({
  ...filledWeek(),
  weights: [],
  todoDays: [],
  recipes: [{ created_at: '2026-10-09T03:00:00Z', is_zero_carb: true }],
});

const geminiOk = JSON.stringify({
  summary: '이번 주 체중 1kg 감량했어요',
  good: '체중을 꾸준히 기록했어요',
  improve: '물 마시기를 더 챙겨요',
  action: '점심에 물 한 잔을 더 마셔요',
  actionLink: null,
  weightNote: '주 초반보다 1kg 줄었어요',
  nextWeek: '단식이 주 2회로 늘어나요',
});

const row = (weekIndex: number, o: Partial<MyReportRow> = {}, startDate = START): MyReportRow => ({
  uid: UID,
  start_date: startDate,
  week_index: weekIndex,
  display_week: weekIndex,
  stats: {} as MyReportRow['stats'],
  content: null,
  status: 'ready',
  is_trial: false,
  created_at: '2026-10-08T23:00:00.000Z', // 10-09 08:00 KST
  regenerated_at: null,
  ...o,
});

const makeDeps = (o: Partial<MyReportDeps> = {}, reports: MyReportRow[] = []) => {
  const db = { reports: [...reports] };
  const find = (startDate: string, weekIndex: number) =>
    db.reports.find((r) => r.start_date === startDate && r.week_index === weekIndex) ?? null;
  const deps: MyReportDeps = {
    now: () => NOW,
    getUid: vi.fn(async () => UID),
    fetchStartDate: vi.fn(async () => START),
    fetchProgramStart: vi.fn(async () => START),
    hasPremiumAccess: vi.fn(async () => true),
    fetchReportPeriods: vi.fn(async () =>
      db.reports.map((r) => ({
        start_date: r.start_date,
        week_index: r.week_index,
        display_week: r.display_week,
      }))
    ),
    fetchFastingPlan: vi.fn(async () => null),
    fetchWeekData: vi.fn(async () => filledWeek()),
    askGemini: vi.fn(async () => geminiOk),
    insertReport: vi.fn(async (r: WeeklyReportRow) => {
      if (find(r.start_date, r.week_index)) return false;
      db.reports.push({ ...r, created_at: NOW.toISOString(), regenerated_at: null });
      return true;
    }),
    fetchReport: vi.fn(async (_uid: string, s: string, w: number) => find(s, w)),
    countReportsCreatedSince: vi.fn(async () => 0),
    recordsChangedSince: vi.fn(async () => true),
    claimRegeneration: vi.fn(async (_uid, s, w, at, dayStartIso) => {
      const r = find(s, w);
      if (!r || (r.regenerated_at && r.regenerated_at >= dayStartIso)) return false;
      r.regenerated_at = at;
      return true;
    }),
    releaseRegeneration: vi.fn(async (_uid, s, w, at, previous) => {
      const r = find(s, w);
      if (r && r.regenerated_at === at) r.regenerated_at = previous;
    }),
    updateReport: vi.fn(async (_uid, s, w, patch) => {
      const r = find(s, w);
      if (!r) return null;
      Object.assign(r, patch);
      return r;
    }),
    ...o,
  };
  return { deps, db };
};

const post = (body: unknown) =>
  new Request('http://localhost/generate-my-report', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const call = async (deps: MyReportDeps, body: unknown) => {
  const res = await handleGenerateMyReport(post(body), deps);
  return { status: res.status, body: await res.json() };
};

describe('generate-my-report: 공통 검증', () => {
  it('로그인하지 않으면 401', async () => {
    const { deps } = makeDeps({ getUid: vi.fn(async () => null) });
    expect(await call(deps, { start_date: START, week_index: 2 })).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
  });

  it('키·mode가 이상하면 400 invalid_request', async () => {
    const { deps } = makeDeps();
    for (const body of [
      {},
      { start_date: '2026-10-1', week_index: 2 },
      { start_date: '2026-02-30', week_index: 2 },
      { start_date: START, week_index: 0 },
      { start_date: START, week_index: 1.5 },
      { start_date: START, week_index: '2' },
      { start_date: START, week_index: 2, mode: 'delete' },
    ]) {
      expect(await call(deps, body)).toEqual({
        status: 400,
        body: { error: 'invalid_request' },
      });
    }
    const bad = await handleGenerateMyReport(
      new Request('http://localhost/x', { method: 'POST', body: '{' }),
      deps
    );
    expect(bad.status).toBe(400);
  });

  it('POST가 아니면 405', async () => {
    const { deps } = makeDeps();
    const res = await handleGenerateMyReport(
      new Request('http://localhost/x', { method: 'GET' }),
      deps
    );
    expect(res.status).toBe(405);
  });

  it('예상하지 못한 오류는 500 (상세는 로그만)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      fetchStartDate: vi.fn(async () => {
        throw new Error('db secret');
      }),
    });
    expect(await call(deps, { start_date: START, week_index: 2 })).toEqual({
      status: 500,
      body: { error: 'internal' },
    });
    spy.mockRestore();
  });
});

describe('generate-my-report: 지금 만들기 (mode 생략 = create)', () => {
  it('지금 회차의 끝난 주에 기록이 있으면 만들어 저장하고 리포트 행을 돌려준다 (푸시 없음)', async () => {
    const { deps, db } = makeDeps();
    const res = await call(deps, { start_date: START, week_index: 2 });
    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({
      start_date: START,
      week_index: 2,
      display_week: 2,
      status: 'ready',
      is_trial: false,
    });
    expect(res.body.report.content.summary).toBe('이번 주 체중 1kg 감량했어요');
    expect(db.reports).toHaveLength(1);
    expect(deps.askGemini).toHaveBeenCalledTimes(1);
    expect(deps.fetchWeekData).toHaveBeenCalledWith(
      expect.objectContaining({ uid: UID, startDate: START, weekIndex: 2 })
    );
  });

  it('체중·할 일 기록이 없으면 400 no_records, Gemini·저장 없음', async () => {
    const { deps, db } = makeDeps({ fetchWeekData: vi.fn(async () => emptyWeek()) });
    expect(await call(deps, { start_date: START, week_index: 2 })).toEqual({
      status: 400,
      body: { error: 'no_records' },
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(db.reports).toHaveLength(0);
  });

  it('패스가 없으면 402 pass_required (무료 1주차도 직접 만들기는 안 된다), 데이터·Gemini 없음', async () => {
    const { deps } = makeDeps({ hasPremiumAccess: vi.fn(async () => false) });
    expect(await call(deps, { start_date: START, week_index: 1 })).toEqual({
      status: 402,
      body: { error: 'pass_required' },
    });
    expect(deps.fetchWeekData).not.toHaveBeenCalled();
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('지금 시작일이 아닌 키·끝나지 않은 주·키 6 이상은 409 not_available (권한 rpc 전)', async () => {
    const { deps } = makeDeps({ fetchStartDate: vi.fn(async () => START) });
    for (const body of [
      { start_date: '2026-09-01', week_index: 1 }, // 다른 시작일
      { start_date: START, week_index: 3 }, // 3주차 중
      { start_date: START, week_index: 6 },
    ]) {
      expect(await call(deps, body)).toEqual({
        status: 409,
        body: { error: 'not_available' },
      });
    }
    // 시작일을 모르면 만들 수 없다
    const { deps: none } = makeDeps({ fetchStartDate: vi.fn(async () => null) });
    expect((await call(none, { start_date: START, week_index: 1 })).status).toBe(409);
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
  });

  it('주가 끝난 다음 날 00:00 KST부터 만들 수 있다', async () => {
    // 10-15 00:00 KST = 2주차(10-08~10-14)가 막 끝남
    const { deps } = makeDeps({ now: () => new Date('2026-10-14T15:00:00Z') });
    expect((await call(deps, { start_date: START, week_index: 2 })).status).toBe(200);
    const { deps: before } = makeDeps({ now: () => new Date('2026-10-14T14:59:00Z') });
    expect((await call(before, { start_date: START, week_index: 2 })).status).toBe(409);
  });

  it('표시 주차가 5보다 크면 409 not_available', async () => {
    // 09-03 시작 5주차(10-01~10-07) 뒤, 한 주 더로 시작일 09-10 → (09-10, 5) = 10-08~10-14가 실제 6주차
    const start = '2026-09-10';
    const { deps } = makeDeps(
      {
        fetchStartDate: vi.fn(async () => start),
        fetchProgramStart: vi.fn(async () => '2026-09-03'),
      },
      [row(5, { display_week: 5 }, '2026-09-03')]
    );
    expect(await call(deps, { start_date: start, week_index: 5 })).toEqual({
      status: 409,
      body: { error: 'not_available' },
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('키가 달라도 이미 있는 리포트와 같은 주(4일 이상 겹침)면 409 not_available', async () => {
    // 한 주 더 하기: 옛 (09-24, 2) = 10-01~10-07 리포트가 있고 시작일이 10-01로 바뀜
    const { deps } = makeDeps({ fetchProgramStart: vi.fn(async () => '2026-09-24') }, [
      row(2, {}, '2026-09-24'),
    ]);
    expect((await call(deps, { start_date: START, week_index: 1 })).status).toBe(409);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('같은 키 리포트가 이미 있으면 새로 만들지 않고 그 행을 돌려준다 (두 번 눌러도 한 번)', async () => {
    const existing = row(2, { content: { summary: '있던 리포트' } as MyReportRow['content'] });
    const { deps, db } = makeDeps({}, [existing]);
    const res = await call(deps, { start_date: START, week_index: 2 });
    expect(res.status).toBe(200);
    expect(res.body.report.content.summary).toBe('있던 리포트');
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(db.reports).toHaveLength(1);
  });

  it('최근 24시간에 만든 리포트가 CREATE_DAILY_LIMIT개면 429 daily_limit (Gemini 없음)', async () => {
    const { deps } = makeDeps({ countReportsCreatedSince: vi.fn(async () => CREATE_DAILY_LIMIT) });
    expect(await call(deps, { start_date: START, week_index: 2 })).toEqual({
      status: 429,
      body: { error: 'daily_limit' },
    });
    expect(deps.countReportsCreatedSince).toHaveBeenCalledWith(
      UID,
      new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
    );
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('Gemini가 실패해도 기본 문장으로 만든다 (cron과 같다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      askGemini: vi.fn(async () => {
        throw new Error('quota');
      }),
    });
    const res = await call(deps, { start_date: START, week_index: 2 });
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('ready');
    expect(res.body.report.content.summary).toBeTruthy();
  });
});

describe('generate-my-report: 다시 만들기 (mode regenerate)', () => {
  const regen = { start_date: START, week_index: 2, mode: 'regenerate' };

  it('생성 뒤 기록이 바뀌었고 오늘 다시 만든 적 없으면 새로 만들어 갱신하고 regenerated_at을 남긴다', async () => {
    const old = row(2, { content: { summary: '옛 리포트' } as MyReportRow['content'] });
    const { deps, db } = makeDeps({}, [old]);
    const res = await call(deps, regen);
    expect(res.status).toBe(200);
    expect(res.body.report.content.summary).toBe('이번 주 체중 1kg 감량했어요');
    expect(res.body.report.regenerated_at).toBe(NOW.toISOString());
    expect(db.reports[0].stats.weight.daysLogged).toBe(2);
    // 마지막 생성 시각(created_at) 이후 그 주(키·기간) 기록이 바뀌었는지 본다
    expect(deps.recordsChangedSince).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: UID,
        startDate: START,
        weekIndex: 2,
        range: { from: '2026-10-08', to: '2026-10-14' },
      }),
      old.created_at
    );
    expect(deps.claimRegeneration).toHaveBeenCalledWith(
      UID,
      START,
      2,
      NOW.toISOString(),
      TODAY_START_ISO
    );
  });

  it('표시 주차는 저장된 값을 그대로 쓴다', async () => {
    const { deps, db } = makeDeps({}, [row(2, { display_week: 3 })]);
    await call(deps, regen);
    expect(db.reports[0].display_week).toBe(3);
    expect(db.reports[0].stats.weekIndex).toBe(3);
  });

  it('마지막 생성 시각은 regenerated_at이 있으면 그것', async () => {
    const { deps } = makeDeps({}, [row(2, { regenerated_at: '2026-10-15T01:00:00.000Z' })]);
    expect((await call(deps, regen)).status).toBe(200);
    expect(deps.recordsChangedSince).toHaveBeenCalledWith(
      expect.anything(),
      '2026-10-15T01:00:00.000Z'
    );
  });

  it('오늘(KST) 이미 다시 만들었으면 429 already_regenerated_today', async () => {
    const { deps } = makeDeps({}, [row(2, { regenerated_at: '2026-10-15T15:30:00.000Z' })]);
    expect(await call(deps, regen)).toEqual({
      status: 429,
      body: { error: 'already_regenerated_today' },
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('생성 뒤 기록이 바뀌지 않았으면 409 not_changed', async () => {
    const { deps } = makeDeps({ recordsChangedSince: vi.fn(async () => false) }, [row(2)]);
    expect(await call(deps, regen)).toEqual({ status: 409, body: { error: 'not_changed' } });
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('리포트가 없으면 404 not_found', async () => {
    const { deps } = makeDeps();
    expect(await call(deps, regen)).toEqual({ status: 404, body: { error: 'not_found' } });
  });

  it('패스가 없으면 402', async () => {
    const { deps } = makeDeps({ hasPremiumAccess: vi.fn(async () => false) }, [row(2)]);
    expect((await call(deps, regen)).status).toBe(402);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('지난 회차 리포트·표시 주차 6 이상은 409 not_available', async () => {
    const { deps } = makeDeps({ fetchProgramStart: vi.fn(async () => START) }, [
      row(2, {}, '2026-09-01'),
      row(2, { display_week: 6 }),
    ]);
    expect(
      (await call(deps, { start_date: '2026-09-01', week_index: 2, mode: 'regenerate' })).status
    ).toBe(409);
    expect((await call(deps, regen)).status).toBe(409);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('한 주 더 하기 전 시작일 키여도 지금 회차면 다시 만들 수 있다', async () => {
    // 회차 09-24 시작, 한 주 더로 시작일 10-01. 옛 키 (09-24, 2)
    const { deps } = makeDeps(
      {
        fetchStartDate: vi.fn(async () => START),
        fetchProgramStart: vi.fn(async () => '2026-09-24'),
        // (09-24, 2) = 10-01~10-07
        fetchWeekData: vi.fn(async () => ({
          ...filledWeek(),
          weights: [{ day: '2026-10-02', weight_kg: 70 }],
        })),
      },
      [row(2, {}, '2026-09-24')]
    );
    expect(
      (await call(deps, { start_date: '2026-09-24', week_index: 2, mode: 'regenerate' })).status
    ).toBe(200);
  });

  it('기록이 모두 지워졌으면 400 no_records, 차지하지 않는다', async () => {
    const { deps } = makeDeps({ fetchWeekData: vi.fn(async () => emptyWeek()) }, [row(2)]);
    expect(await call(deps, regen)).toEqual({ status: 400, body: { error: 'no_records' } });
    expect(deps.claimRegeneration).not.toHaveBeenCalled();
  });

  it('예전 빈 리포트(status empty)도 기록이 생겼으면 ready로 다시 만든다', async () => {
    const { deps, db } = makeDeps({}, [row(2, { status: 'empty', content: null })]);
    expect((await call(deps, regen)).status).toBe(200);
    expect(db.reports[0].status).toBe('ready');
  });

  it('동시에 다른 요청이 먼저 차지하면 429, Gemini 없음', async () => {
    const { deps } = makeDeps({ claimRegeneration: vi.fn(async () => false) }, [row(2)]);
    expect((await call(deps, regen)).status).toBe(429);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('Gemini가 실패하면 기존 리포트를 그대로 두고 502 generation_failed, 하루 1번을 되돌린다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const old = row(2, {
      content: { summary: '옛 리포트' } as MyReportRow['content'],
      regenerated_at: '2026-10-14T01:00:00.000Z',
    });
    const { deps, db } = makeDeps(
      {
        askGemini: vi.fn(async () => {
          throw new Error('quota');
        }),
      },
      [old]
    );
    expect(await call(deps, regen)).toEqual({
      status: 502,
      body: { error: 'generation_failed' },
    });
    spy.mockRestore();
    expect(db.reports[0].content?.summary).toBe('옛 리포트');
    expect(db.reports[0].regenerated_at).toBe('2026-10-14T01:00:00.000Z');
    expect(deps.updateReport).not.toHaveBeenCalled();
  });

  it('갱신 저장이 실패하면 되돌리고 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps(
      {
        updateReport: vi.fn(async () => {
          throw new Error('db');
        }),
      },
      [row(2)]
    );
    expect((await call(deps, regen)).status).toBe(500);
    spy.mockRestore();
    expect(db.reports[0].regenerated_at).toBeNull();
  });
});

describe('generate-my-report: 다시 만들 수 있는지 (mode check)', () => {
  const check = { start_date: START, week_index: 2, mode: 'check' };

  it('조건이 맞으면 can_regenerate true, Gemini·차지 없음', async () => {
    const { deps } = makeDeps({}, [row(2)]);
    expect(await call(deps, check)).toEqual({
      status: 200,
      body: { can_regenerate: true, reason: 'ok' },
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.claimRegeneration).not.toHaveBeenCalled();
    expect(deps.fetchWeekData).not.toHaveBeenCalled();
  });

  it('안 되면 이유와 함께 false (200)', async () => {
    const cases: [Partial<MyReportDeps>, MyReportRow, string][] = [
      [{ hasPremiumAccess: vi.fn(async () => false) }, row(2), 'pass_required'],
      [{}, row(2, { regenerated_at: '2026-10-16T01:00:00.000Z' }), 'already_regenerated_today'],
      [{ recordsChangedSince: vi.fn(async () => false) }, row(2), 'not_changed'],
      [{}, row(2, { display_week: 6 }), 'not_available'],
    ];
    for (const [o, r, reason] of cases) {
      const { deps } = makeDeps(o, [r]);
      expect(await call(deps, check)).toEqual({
        status: 200,
        body: { can_regenerate: false, reason },
      });
    }
  });

  it('리포트가 없으면 404', async () => {
    const { deps } = makeDeps();
    expect((await call(deps, check)).status).toBe(404);
  });
});
