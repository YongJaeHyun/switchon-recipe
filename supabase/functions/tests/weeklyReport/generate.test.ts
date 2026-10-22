import { describe, expect, it, vi } from 'vitest';
import {
  generateWeeklyReports,
  handleGenerateWeeklyReports,
  reportWeekOf,
  type GenerateReportsDeps,
  type NotificationRow,
  type WeekData,
  type WeeklyReportRow,
} from '../../generate-weekly-reports/handler.ts';

// 2026-10-15(목) 08:00 KST
const NOW = new Date('2026-10-14T23:00:00Z');
const TODAY = '2026-10-15';

// 2주차(10-08 ~ 10-14) 기록이 있는 데이터
const filledWeek = (): WeekData => ({
  weights: [
    { day: '2026-10-08', weight_kg: 70 },
    { day: '2026-10-14', weight_kg: 69 },
  ],
  todoDays: [{ day: '2026-10-09', items: ['아침 쉐이크 마시기', '물 2L'], checked: [0] }],
  fastingPlanDays: [3],
  fastingPlanStartTime: null,
  fastingResults: [{ day: '2026-10-14', result: 'success' }],
  recipes: [{ created_at: '2026-10-09T03:00:00Z', is_zero_carb: true }],
  foodChecks: [{ created_at: '2026-10-10T03:00:00Z', verdict: 'avoid' }],
});

const emptyWeek = (): WeekData => ({
  weights: [],
  todoDays: [],
  fastingPlanDays: null,
  fastingPlanStartTime: null,
  fastingResults: [],
  recipes: [],
  foodChecks: [],
});

const geminiOk = JSON.stringify({
  summary: '이번 주 체중 1kg 감량했어요',
  good: '체중을 꾸준히 기록했어요',
  improve: '물 마시기를 더 챙겨요',
  action: '점심에 물 한 잔을 더 마셔요',
  actionLink: { meal: 'lunch' },
  weightNote: '주 초반보다 1kg 줄었어요',
  nextWeek: '단식이 주 2회로 늘어나요',
});

interface FakeDb {
  reports: WeeklyReportRow[];
  notifications: NotificationRow[];
}

const makeDeps = (
  o: Partial<GenerateReportsDeps> = {},
  db: FakeDb = { reports: [], notifications: [] }
) => {
  const deps: GenerateReportsDeps = {
    now: () => NOW,
    fetchUsers: vi.fn(async () => [
      { id: 'a', start_date: '2026-10-01' }, // 14일 → 2주차 리포트
      { id: 'b', start_date: '2026-10-15' }, // 시작일 당일 → 제외
      { id: 'c', start_date: '2026-10-03' }, // 12일 → 주차 1일차 아님
      { id: 'd', start_date: '2026-10-08' }, // 7일이지만 패스 없음
      { id: 'e', start_date: null },
    ]),
    hasPremiumAccess: vi.fn(async (uid: string) => uid !== 'd'),
    reportExists: vi.fn(async (uid: string, startDate: string, weekIndex: number) =>
      db.reports.some(
        (r) => r.uid === uid && r.start_date === startDate && r.week_index === weekIndex
      )
    ),
    fetchWeekData: vi.fn(async () => filledWeek()),
    askGemini: vi.fn(async () => geminiOk),
    insertReport: vi.fn(async (row: WeeklyReportRow) => {
      const dup = db.reports.some(
        (r) =>
          r.uid === row.uid && r.start_date === row.start_date && r.week_index === row.week_index
      );
      if (dup) return false;
      db.reports.push(row);
      return true;
    }),
    insertNotification: vi.fn(async (row: NotificationRow) => {
      db.notifications.push(row);
    }),
    ...o,
  };
  return { deps, db };
};

describe('reportWeekOf', () => {
  it('새 주차 1~3일차면 끝난 주차를, 아니면 null (놓친 리포트를 이틀 더 보충)', () => {
    expect(reportWeekOf('2026-10-01', '2026-10-08')).toBe(1); // 2주차 1일차
    expect(reportWeekOf('2026-10-01', '2026-10-09')).toBe(1); // 2일차
    expect(reportWeekOf('2026-10-01', '2026-10-10')).toBe(1); // 3일차
    expect(reportWeekOf('2026-10-01', '2026-10-11')).toBeNull(); // 4일차
    expect(reportWeekOf('2026-10-01', '2026-10-14')).toBeNull(); // 7일차
    expect(reportWeekOf('2026-10-01', '2026-10-15')).toBe(2);
    expect(reportWeekOf('2026-10-01', '2026-10-17')).toBe(2);
    expect(reportWeekOf('2026-10-01', '2026-10-01')).toBeNull();
    expect(reportWeekOf('2026-10-01', '2026-10-02')).toBeNull(); // 1주차 2일차: 끝난 주 없음
    expect(reportWeekOf('2026-10-01', '2026-10-03')).toBeNull();
    expect(reportWeekOf('2026-10-20', '2026-10-13')).toBeNull();
    expect(reportWeekOf(null, '2026-10-13')).toBeNull();
  });

  it('월말을 넘겨도 날짜 차이로 계산하고, 시각이 붙은 값은 날짜만 본다', () => {
    expect(reportWeekOf('2026-10-29', '2026-11-05')).toBe(1);
    expect(reportWeekOf('2026-10-29T00:00:00', '2026-11-05')).toBe(1);
  });
});

describe('generateWeeklyReports: 놓친 리포트 보충', () => {
  // TODAY 10-15 기준
  const users = [
    { id: 'day2', start_date: '2026-10-07' }, // 8일 → 2주차 2일차, 1주차 리포트 보충
    { id: 'day3', start_date: '2026-10-06' }, // 9일 → 2주차 3일차
    { id: 'day4', start_date: '2026-10-05' }, // 10일 → 2주차 4일차, 대상 아님
  ];

  it('새 주차 2·3일차에 리포트가 없으면 만들고 푸시한다', async () => {
    const { deps, db } = makeDeps({ fetchUsers: vi.fn(async () => users) });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(db.reports.map((r) => [r.uid, r.start_date, r.week_index])).toEqual([
      ['day2', '2026-10-07', 1],
      ['day3', '2026-10-06', 1],
    ]);
    expect(db.notifications.map((n) => n.href).sort()).toEqual([
      '/report/2026-10-06/1',
      '/report/2026-10-07/1',
    ]);
    expect(result).toMatchObject({ candidates: 2, generated: 2, notified: 2 });
  });

  it('보충할 리포트가 이미 있으면 AI·저장·푸시 없음', async () => {
    const { deps, db } = makeDeps({ fetchUsers: vi.fn(async () => users.slice(0, 1)) });
    db.reports.push({
      uid: 'day2',
      start_date: '2026-10-07',
      week_index: 1,
      stats: {} as WeeklyReportRow['stats'],
      content: null,
      status: 'ready',
    });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.insertReport).not.toHaveBeenCalled();
    expect(db.notifications).toHaveLength(0);
    expect(result).toMatchObject({ candidates: 1, existing: 1, generated: 0 });
  });

  it('리포트가 이미 있으면 이용 권한 rpc를 부르지 않는다 (재시도 cron 호출 절약)', async () => {
    const { deps, db } = makeDeps({ fetchUsers: vi.fn(async () => users.slice(0, 1)) });
    db.reports.push({
      uid: 'day2',
      start_date: '2026-10-07',
      week_index: 1,
      stats: {} as WeeklyReportRow['stats'],
      content: null,
      status: 'ready',
    });
    await generateWeeklyReports(deps, TODAY);
    expect(deps.reportExists).toHaveBeenCalledTimes(1);
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
  });

  it('1일차에 만든 리포트는 2·3일차 실행에서 다시 만들지 않는다', async () => {
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-01' }]),
    });
    await generateWeeklyReports(deps, '2026-10-15');
    await generateWeeklyReports(deps, '2026-10-16');
    await generateWeeklyReports(deps, '2026-10-17');
    expect(db.reports).toHaveLength(1);
    expect(deps.askGemini).toHaveBeenCalledTimes(1);
    expect(db.notifications).toHaveLength(1);
  });

  it('4일차에는 보충하지 않는다', async () => {
    const { deps, db } = makeDeps({ fetchUsers: vi.fn(async () => users.slice(2)) });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
    expect(db.reports).toHaveLength(0);
    expect(result.candidates).toBe(0);
  });
});

describe('generateWeeklyReports', () => {
  it('생성 시점에 응답 창이 열린 단식은 pending으로 저장한다 (실패로 세지 않음)', async () => {
    const { deps, db } = makeDeps({
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingPlanStartTime: '저녁 식후', // 수(10-14) 19:00 시작 → 08:00 KST엔 아직 단식 중
        fastingResults: [],
      })),
    });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].stats.fasting).toMatchObject({
      planned: 1,
      success: 0,
      broken: 0,
      pending: 1,
    });
    const prompt = vi.mocked(deps.askGemini).mock.calls[0][0];
    expect(prompt).toContain('응답 대기 1회');
  });

  it('주차 1일차·패스 유저만 지난 주차 리포트를 만들고 푸시한다', async () => {
    const { deps, db } = makeDeps();
    const result = await generateWeeklyReports(deps, TODAY);

    expect(deps.fetchUsers).toHaveBeenCalledWith(TODAY);
    expect(deps.hasPremiumAccess).toHaveBeenCalledTimes(2); // a, d만
    expect(deps.fetchWeekData).toHaveBeenCalledTimes(1);
    expect(deps.fetchWeekData).toHaveBeenCalledWith({
      uid: 'a',
      startDate: '2026-10-01',
      weekIndex: 2,
      range: { from: '2026-10-08', to: '2026-10-14' },
      fromIso: '2026-10-07T15:00:00.000Z',
      toIso: '2026-10-14T15:00:00.000Z',
    });

    expect(db.reports).toHaveLength(1);
    const report = db.reports[0];
    expect(report).toMatchObject({
      uid: 'a',
      start_date: '2026-10-01',
      week_index: 2,
      status: 'ready',
    });
    expect(report.stats.weight).toMatchObject({ start: 70, end: 69, diff: -1, daysLogged: 2 });
    // fasting_plan days [3] = 수요일 → 10-14
    expect(report.stats.fasting).toMatchObject({ planned: 1, success: 1 });
    expect(report.stats.recipes).toEqual({ total: 1, low: 0, zero: 1 });
    expect(report.stats.foodChecks).toEqual({ total: 1, avoid: 1 });
    expect(report.content?.summary).toBe('이번 주 체중 1kg 감량했어요');

    expect(db.notifications).toEqual([
      {
        uid: 'a',
        title: '2주차 리포트가 도착했어요',
        body: expect.any(String),
        href: '/report/2026-10-01/2',
        channel_id: 'REPORT',
        type: 'WEEKLY_REPORT',
      },
    ]);
    expect(result).toMatchObject({
      today: TODAY,
      candidates: 2,
      generated: 1,
      empty: 0,
      existing: 0,
      notified: 1,
      failed: 0,
    });
  });

  it('프롬프트에 다음 주(3주차) 규칙을 넣는다', async () => {
    const { deps } = makeDeps();
    await generateWeeklyReports(deps, TODAY);
    const prompt = vi.mocked(deps.askGemini).mock.calls[0][0];
    expect(prompt).toContain('주 2회');
  });

  it('이미 리포트가 있으면 AI 호출·저장·푸시 없음', async () => {
    const { deps, db } = makeDeps();
    db.reports.push({
      uid: 'a',
      start_date: '2026-10-01',
      week_index: 2,
      stats: {} as WeeklyReportRow['stats'],
      content: null,
      status: 'ready',
    });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.fetchWeekData).not.toHaveBeenCalled();
    expect(deps.insertReport).not.toHaveBeenCalled();
    expect(db.notifications).toHaveLength(0);
    expect(result).toMatchObject({ existing: 1, generated: 0, notified: 0 });
  });

  it('같은 날 두 번 실행해도 리포트 1개, AI 1번, 푸시 1번', async () => {
    const { deps, db } = makeDeps();
    await generateWeeklyReports(deps, TODAY);
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports).toHaveLength(1);
    expect(deps.askGemini).toHaveBeenCalledTimes(1);
    expect(db.notifications).toHaveLength(1);
  });

  it('저장 시 키가 충돌하면(동시 실행) 푸시하지 않는다', async () => {
    const { deps, db } = makeDeps({ insertReport: vi.fn(async () => false) });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(db.notifications).toHaveLength(0);
    expect(result).toMatchObject({ generated: 0, existing: 1, notified: 0 });
  });

  it('AI 실패 → 기본 문장으로 저장하고 푸시한다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps({
      askGemini: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const result = await generateWeeklyReports(deps, TODAY);
    spy.mockRestore();
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0].status).toBe('ready');
    expect(db.reports[0].content?.summary).toEqual(expect.any(String));
    expect(db.reports[0].content?.nextWeek).toContain('주 2회');
    expect(db.notifications).toHaveLength(1);
    expect(result).toMatchObject({ generated: 1, notified: 1, failed: 0 });
  });

  it('AI 응답을 해석할 수 없으면 기본 문장', async () => {
    const { deps, db } = makeDeps({ askGemini: vi.fn(async () => 'not json') });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].content?.summary).not.toBe('');
    expect(db.reports[0].content?.summary).not.toBe('이번 주 체중 1kg 감량했어요');
    expect(db.notifications).toHaveLength(1);
  });

  it('통계에 없는 숫자는 기본 문장으로 바꾼다', async () => {
    const { deps, db } = makeDeps({
      askGemini: vi.fn(async () =>
        JSON.stringify({ ...JSON.parse(geminiOk), summary: '이번 주 체중 3.5kg 감량했어요' })
      ),
    });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].content?.summary).not.toContain('3.5kg');
    expect(db.reports[0].content?.good).toBe('체중을 꾸준히 기록했어요');
  });

  it('기록이 없으면 empty로 저장하고 AI 호출·푸시 없음', async () => {
    const { deps, db } = makeDeps({ fetchWeekData: vi.fn(async () => emptyWeek()) });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0]).toMatchObject({ status: 'empty', content: null });
    expect(db.reports[0].stats.isEmpty).toBe(true);
    expect(db.notifications).toHaveLength(0);
    expect(result).toMatchObject({ generated: 0, empty: 1, notified: 0 });
  });

  it('잘못된 기록 값(verdict null, 알 수 없는 result)은 빼고 계산한다', async () => {
    const { deps, db } = makeDeps({
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingResults: [{ day: '2026-10-14', result: 'weird' }],
        foodChecks: [{ created_at: '2026-10-10T03:00:00Z', verdict: null }],
        recipes: [{ created_at: '2026-10-09T03:00:00Z', is_zero_carb: null }],
      })),
    });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].stats.fasting).toMatchObject({ success: 0, broken: 0 });
    expect(db.reports[0].stats.foodChecks).toEqual({ total: 0, avoid: 0 });
    expect(db.reports[0].stats.recipes).toEqual({ total: 1, low: 1, zero: 0 });
  });

  it('한 유저의 오류는 다른 유저 처리를 막지 않는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [
        { id: 'a', start_date: '2026-10-01' },
        { id: 'x', start_date: '2026-10-08' },
      ]),
      fetchWeekData: vi.fn(async (q) => {
        if (q.uid === 'x') throw new Error('db');
        return filledWeek();
      }),
    });
    const result = await generateWeeklyReports(deps, TODAY);
    spy.mockRestore();
    expect(db.reports.map((r) => r.uid)).toEqual(['a']);
    expect(result).toMatchObject({ generated: 1, failed: 1 });
  });

  it('알림 저장 실패는 실패로 세지만 리포트는 남는다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps({
      insertNotification: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const result = await generateWeeklyReports(deps, TODAY);
    spy.mockRestore();
    expect(db.reports).toHaveLength(1);
    expect(result).toMatchObject({ generated: 1, notified: 0, failed: 1 });
  });

  it('동시 처리 수를 제한한다', async () => {
    let active = 0;
    let peak = 0;
    const users = Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, start_date: '2026-10-01' }));
    const { deps } = makeDeps({
      fetchUsers: vi.fn(async () => users),
      askGemini: vi.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return geminiOk;
      }),
    });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(result.generated).toBe(20);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

const req = (auth: string | null, query = '') =>
  new Request(`http://localhost/generate-weekly-reports${query}`, {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });

describe('handleGenerateWeeklyReports', () => {
  it('service role이 아니면 403 (today 지정도 거부)', async () => {
    const { deps } = makeDeps();
    expect((await handleGenerateWeeklyReports(req(jwt('authenticated')), deps)).status).toBe(403);
    expect(
      (await handleGenerateWeeklyReports(req(jwt('authenticated'), '?today=2026-10-15'), deps))
        .status
    ).toBe(403);
    expect((await handleGenerateWeeklyReports(req(null), deps)).status).toBe(403);
    expect(deps.fetchUsers).not.toHaveBeenCalled();
  });

  it('today 없이 호출하면 현재 KST 날짜', async () => {
    const { deps } = makeDeps();
    const res = await handleGenerateWeeklyReports(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ today: TODAY, generated: 1 });
  });

  it('KST 자정 직후도 KST 날짜로 본다', async () => {
    const { deps } = makeDeps({ now: () => new Date('2026-10-14T15:30:00Z') });
    const res = await handleGenerateWeeklyReports(req(jwt('service_role')), deps);
    expect(await res.json()).toMatchObject({ today: '2026-10-15' });
  });

  it('service role은 ?today=로 날짜를 지정할 수 있다', async () => {
    const { deps } = makeDeps();
    const res = await handleGenerateWeeklyReports(
      req(jwt('service_role'), '?today=2026-10-08'),
      deps
    );
    expect(res.status).toBe(200);
    // 10-08: a만 1주차 리포트 대상 (d는 시작일 당일, c(10-03)는 5일째, b(10-15)는 시작 전)
    expect(await res.json()).toMatchObject({ today: '2026-10-08', candidates: 1 });
    expect(deps.fetchUsers).toHaveBeenCalledWith('2026-10-08');
    expect(deps.fetchWeekData).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'a', weekIndex: 1 })
    );
  });

  it('잘못된 today는 400', async () => {
    const { deps } = makeDeps();
    for (const q of ['?today=2026-1-5', '?today=2026-02-30', '?today=abc', '?today=']) {
      expect((await handleGenerateWeeklyReports(req(jwt('service_role'), q), deps)).status).toBe(
        400
      );
    }
    expect(deps.fetchUsers).not.toHaveBeenCalled();
  });

  it('유저 목록 조회 실패는 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      fetchUsers: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const res = await handleGenerateWeeklyReports(req(jwt('service_role')), deps);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });
});
