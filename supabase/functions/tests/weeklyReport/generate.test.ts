import { describe, expect, it, vi } from 'vitest';
import {
  displayWeekFor,
  generateWeeklyReports,
  handleGenerateWeeklyReports,
  reportWeekOf,
  sameProgramReports,
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
  fastingPlanStartMinutes: null,
  fastingResults: [{ day: '2026-10-14', result: 'success' }],
  recipes: [{ created_at: '2026-10-09T03:00:00Z', is_zero_carb: true }],
  foodChecks: [{ created_at: '2026-10-10T03:00:00Z', verdict: 'avoid' }],
});

const emptyWeek = (): WeekData => ({
  weights: [],
  todoDays: [],
  fastingPlanDays: null,
  fastingPlanStartTime: null,
  fastingPlanStartMinutes: null,
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
    fetchReportPeriods: vi.fn(async (uid: string) =>
      db.reports
        .filter((r) => r.uid === uid)
        .map((r) => ({
          start_date: r.start_date,
          week_index: r.week_index,
          display_week: r.display_week,
        }))
    ),
    fetchProgramStart: vi.fn(async () => null),
    fetchFastingPlan: vi.fn(async () => null),
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
      display_week: 1,
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
      display_week: 1,
      stats: {} as WeeklyReportRow['stats'],
      content: null,
      status: 'ready',
    });
    await generateWeeklyReports(deps, TODAY);
    expect(deps.fetchReportPeriods).toHaveBeenCalledTimes(1);
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

  it('요일별 start_minutes가 label보다 우선해 pending을 정한다', async () => {
    // 월(10-12) 계획. label(저녁 식후 19:00)이면 10-15 19:00까지 대기지만
    // start_minutes 06:00이면 10-15 06:00에 닫혀 08:00 KST엔 대기가 아니다
    const { deps, db } = makeDeps({
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingPlanStartTime: '저녁 식후',
        fastingPlanDays: [1],
        fastingPlanStartMinutes: { '1': 360 },
        fastingResults: [],
      })),
    });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].stats.fasting.pending).toBe(0);
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
      baselineStart: '2026-10-01',
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
      display_week: 2,
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
      display_week: 2,
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

  it('그 주 기록이 하나도 없으면 리포트를 만들지 않는다 (대상 = 기록 1개 이상)', async () => {
    const { deps, db } = makeDeps({ fetchWeekData: vi.fn(async () => emptyWeek()) });
    const result = await generateWeeklyReports(deps, TODAY);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(db.reports).toHaveLength(0);
    expect(db.notifications).toHaveLength(0);
    expect(result).toMatchObject({ generated: 0, empty: 0, skipped: 1, notified: 0 });
  });

  it('체중·할 일 기록 없이 다른 기록만 있으면 empty로 저장하고 AI 호출·푸시 없음', async () => {
    const { deps, db } = makeDeps({
      fetchWeekData: vi.fn(async () => ({
        ...emptyWeek(),
        recipes: [{ created_at: '2026-10-09T03:00:00Z', is_zero_carb: true }],
      })),
    });
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

  it('일찍 끝낸 단식의 fasted_minutes를 통계로 옮긴다 (없거나 숫자가 아니면 시간 없음)', async () => {
    const { deps, db } = makeDeps({
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingResults: [
          { day: '2026-10-13', result: 'broken', fasted_minutes: 1080 },
          { day: '2026-10-14', result: 'broken', fasted_minutes: null },
        ],
      })),
    });
    await generateWeeklyReports(deps, TODAY);
    expect(db.reports[0].stats.fasting.earlyEnded).toEqual([
      { weekday: '화요일', fastedMinutes: 1080 },
      { weekday: '수요일', fastedMinutes: null },
    ]);
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

const reportRow = (
  uid: string,
  start_date: string,
  week_index: number,
  display_week: number | null = null
): WeeklyReportRow => ({
  uid,
  start_date,
  week_index,
  display_week: display_week ?? week_index,
  stats: {} as WeeklyReportRow['stats'],
  content: null,
  status: 'ready',
});

describe('displayWeekFor (리포트 제목 = 실제로 지낸 주차)', () => {
  const p = (start_date: string, week_index: number, display_week: number | null = null) => ({
    start_date,
    week_index,
    display_week,
  });

  it('겹치는 리포트도 이어지는 리포트도 없으면 week_index', () => {
    expect(displayWeekFor({ startDate: '2026-10-01', weekIndex: 2 }, [])).toBe(2);
    expect(displayWeekFor({ startDate: '2026-10-01', weekIndex: 2 }, [p('2026-10-01', 1)])).toBe(2);
  });

  it('4일 이상 겹치면 그 리포트의 표시 주차(display_week ?? week_index)를 이어받는다', () => {
    // 한 주 더: (10-08, 1) = 10-08~10-14 = 옛 (10-01, 2)
    expect(displayWeekFor({ startDate: '2026-10-08', weekIndex: 1 }, [p('2026-10-01', 2)])).toBe(2);
    // 4일 겹침 (10-04~10-10 vs 10-01~10-07)
    expect(displayWeekFor({ startDate: '2026-10-04', weekIndex: 1 }, [p('2026-10-01', 2, 3)])).toBe(
      1
    );
    expect(displayWeekFor({ startDate: '2026-10-04', weekIndex: 1 }, [p('2026-10-01', 1, 3)])).toBe(
      3
    );
  });

  it('3일 이하로 겹치면 이어받지 않는다', () => {
    // (10-05, 1) = 10-05~10-11, (10-01, 2) = 10-08~10-14와 4일 → 이어받음 / (10-01, 1)과 3일 → 아님
    expect(displayWeekFor({ startDate: '2026-10-05', weekIndex: 1 }, [p('2026-10-01', 1)])).toBe(1);
  });

  it('시작일이 뒤로 밀린 뒤(한 주 더) 바로 이어지는 기간이면 앞 리포트 표시 주차 + 1 (감사 #3: 08:00 전 한 주 더)', () => {
    // (10-01, 1) 뒤 10-15 07:30 한 주 더 → 시작일 10-08, (10-01, 2)는 만들어지지 않았다.
    // (10-08, 1) = 10-08~10-14는 2주차로 지낸 기간
    expect(displayWeekFor({ startDate: '2026-10-08', weekIndex: 1 }, [p('2026-10-01', 1)])).toBe(2);
  });

  it('한 주 더로 다시 지낸 주는 같은 숫자 (같은 시작일의 다음 주는 week_index)', () => {
    // (10-01,1)=1, (10-01,2)=2, (10-08,1)=2(같은 기간), (10-08,2) = 10-15~10-21 = 2주차 한 번 더
    const reports = [p('2026-10-01', 1), p('2026-10-01', 2), p('2026-10-08', 1, 2)];
    expect(displayWeekFor({ startDate: '2026-10-08', weekIndex: 2 }, reports)).toBe(2);
    // 08:00 전 한 주 더였던 경우도 같다
    expect(
      displayWeekFor({ startDate: '2026-10-08', weekIndex: 2 }, [
        p('2026-10-01', 1),
        p('2026-10-08', 1, 2),
      ])
    ).toBe(2);
    // 그다음 주는 3주차
    expect(
      displayWeekFor({ startDate: '2026-10-08', weekIndex: 3 }, [...reports, p('2026-10-08', 2)])
    ).toBe(3);
  });

  it('한 주 더를 두 번 08:00 전에 하면 1, 2, 2, 2 (다시 지낸 주는 계속 2주차, 리뷰 #1)', () => {
    // 10-01 시작. 10-15 07:30 한 주 더 → 10-08, 10-22 07:30 또 한 주 더 → 10-15
    const first = [p('2026-10-01', 1, 1), p('2026-10-08', 1, 2)];
    expect(displayWeekFor({ startDate: '2026-10-15', weekIndex: 1 }, first)).toBe(2);
    const second = [...first, p('2026-10-15', 1, 2)];
    expect(displayWeekFor({ startDate: '2026-10-15', weekIndex: 2 }, second)).toBe(2);
  });

  it('한 주 더 한 번은 08:00 뒤, 두 번째는 08:00 전이어도 다시 지낸 주는 2주차 (리뷰 #1)', () => {
    // (10-01,1)=1, (10-01,2)=2, 같은 기간 (10-08,1)=2, 10-22 07:30 또 한 주 더 → 10-15
    const reports = [p('2026-10-01', 1, 1), p('2026-10-01', 2, 2), p('2026-10-08', 1, 2)];
    expect(displayWeekFor({ startDate: '2026-10-15', weekIndex: 1 }, reports)).toBe(2);
    expect(
      displayWeekFor({ startDate: '2026-10-15', weekIndex: 2 }, [...reports, p('2026-10-15', 1, 2)])
    ).toBe(2);
  });

  it('새 1주차가 2주차 이상 리포트 바로 뒤면 이어 세지 않는다 (5.x 다시 시작, 리뷰 #2)', () => {
    // 5.x는 program_start를 옛 값으로 둔 채 다시 시작한다. (10-01, 3) = 10-15~10-21 뒤 10-22 다시 시작
    expect(displayWeekFor({ startDate: '2026-10-22', weekIndex: 1 }, [p('2026-10-01', 3)])).toBe(1);
    // 한계: 앞 리포트가 1주차면 08:00 전 한 주 더와 구별할 수 없어 2주차로 본다
    expect(displayWeekFor({ startDate: '2026-10-08', weekIndex: 1 }, [p('2026-10-01', 1)])).toBe(2);
  });

  it('주차 맞추기로 앞당기면(주차가 올라감) 사용자가 정한 week_index', () => {
    // (10-08, 1) 뒤 2주차 중 4주차로 맞춤 → 시작일 09-24. (09-24, 4) = 10-15~10-21
    expect(displayWeekFor({ startDate: '2026-09-24', weekIndex: 4 }, [p('2026-10-08', 1)])).toBe(4);
  });

  it('바로 이어지지 않으면(빈 주가 있으면) week_index', () => {
    expect(displayWeekFor({ startDate: '2026-10-15', weekIndex: 1 }, [p('2026-10-01', 1)])).toBe(1);
  });
});

describe('sameProgramReports', () => {
  const p = (start_date: string, week_index: number) => ({
    start_date,
    week_index,
    display_week: null,
  });
  const reports = [p('2026-08-01', 3), p('2026-10-01', 1), p('2026-10-08', 1)];

  it('지금 회차: 회차 시작일(program_start, 없으면 시작일) 이후 시작일의 리포트', () => {
    expect(sameProgramReports(reports, '2026-10-08', '2026-10-01')).toEqual(reports.slice(1));
    expect(sameProgramReports(reports, '2026-10-08', null)).toEqual(reports.slice(2));
  });

  it('지난 회차(다시 시작 직전 주 보충): 회차 시작일 전 시작일의 리포트', () => {
    expect(sameProgramReports(reports, '2026-08-01', '2026-10-01')).toEqual(reports.slice(0, 1));
  });
});

// 한 주 더 하기·주차 맞추기로 시작일이 바뀌면 키(start_date, week_index)가 달라진다.
// 같은 기간이라도 리포트는 만들고(운영자 결정 2026-10-31), 제목은 실제로 지낸 주차(display_week)로 붙인다
describe('generateWeeklyReports: 시작일이 바뀐 뒤 리포트 제목은 실제로 지낸 주차', () => {
  it('한 주 더 하기 뒤 같은 기간(옛 2주차 = 새 1주차)도 만들고, 2주차로 붙인다', async () => {
    // 10-15에 (10-01, 2주차 10-08~10-14)를 만든 뒤 한 주 더 하기 → 시작일 10-08. 새 키 (10-08, 1) = 같은 기간
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-01'),
    });
    db.reports.push(reportRow('a', '2026-10-01', 2));
    const result = await generateWeeklyReports(deps, '2026-10-16');
    expect(result).toMatchObject({ candidates: 1, generated: 1, notified: 1 });
    const row = db.reports[1];
    expect(row).toMatchObject({ start_date: '2026-10-08', week_index: 1, display_week: 2 });
    expect(row.stats.weekIndex).toBe(2);
    expect(db.notifications[0]).toMatchObject({
      title: '2주차 리포트가 도착했어요',
      href: '/report/2026-10-08/1', // 상세 경로 키는 그대로
    });
  });

  it('Gemini 프롬프트·단식 계획도 표시 주차로 본다 (2주차 문맥, 다음 주 3주차)', async () => {
    // 08:00 전 한 주 더: (10-01, 2)는 없고 (10-01, 1)만 있다 (감사 #3)
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-01'),
      fetchWeekData: vi.fn(async () => ({ ...filledWeek(), fastingResults: [] })),
    });
    db.reports.push(reportRow('a', '2026-10-01', 1));
    await generateWeeklyReports(deps, '2026-10-15');
    const prompt = vi.mocked(deps.askGemini).mock.calls[0][0];
    expect(prompt).toContain('2주차 주간 리포트');
    expect(prompt).toContain('다음 주(3주차)');
    expect(db.reports[1]).toMatchObject({ week_index: 1, display_week: 2 });
    // 1주차(week_index 1)여도 지낸 주차가 2주차라 수요일 단식 계획을 센다
    expect(db.reports[1].stats.fasting.planned).toBe(1);
  });

  it('새 키에 단식 계획이 없으면 그 기간의 옛 키(겹친 리포트) 계획을 쓴다 (리뷰 #3)', async () => {
    // 한 주 더 뒤 (10-08, 1) = 옛 (10-01, 2). 앱은 계획을 (10-01, 2)에만 남겼다
    const fetchFastingPlan = vi.fn(async () => ({
      days: [3],
      start_time: null,
      start_minutes: null,
    }));
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-01'),
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingPlanDays: null,
        fastingResults: [],
      })),
      fetchFastingPlan,
    });
    db.reports.push(reportRow('a', '2026-10-01', 2));
    await generateWeeklyReports(deps, '2026-10-16');
    expect(fetchFastingPlan).toHaveBeenCalledWith('a', '2026-10-01', 2);
    expect(db.reports[1].stats.fasting.planned).toBe(1); // 수요일 10-14
  });

  it('08:00 전 한 주 더로 옛 키 리포트가 없으면 옛 시작일 기준 그 주차 계획을 쓴다 (리뷰 #3)', async () => {
    const fetchFastingPlan = vi.fn(async () => ({
      days: [3],
      start_time: null,
      start_minutes: null,
    }));
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-01'),
      fetchWeekData: vi.fn(async () => ({
        ...filledWeek(),
        fastingPlanDays: null,
        fastingResults: [],
      })),
      fetchFastingPlan,
    });
    db.reports.push(reportRow('a', '2026-10-01', 1));
    await generateWeeklyReports(deps, '2026-10-15');
    expect(fetchFastingPlan).toHaveBeenCalledWith('a', '2026-10-01', 2);
    expect(db.reports[1].stats.fasting.planned).toBe(1);
  });

  it('새 키에 계획이 있거나 이어받을 옛 키가 없으면 다시 읽지 않는다', async () => {
    const { deps } = makeDeps();
    await generateWeeklyReports(deps, TODAY);
    expect(deps.fetchFastingPlan).not.toHaveBeenCalled();
  });

  it('지난 회차의 리포트는 이어받지 않는다', async () => {
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-08'),
    });
    db.reports.push(reportRow('a', '2026-10-01', 2, 5));
    await generateWeeklyReports(deps, '2026-10-15');
    expect(db.reports[1]).toMatchObject({ week_index: 1, display_week: 1 });
  });

  it('다시 시작 직전 회차의 마지막 주 보충(후보 SQL이 옛 시작일로 준 행)은 지난 회차 리포트로 이어 붙인다', async () => {
    // 10-01 시작, (10-01, 1) 있음. 10-15 07:30 다시 시작(오늘부터) → program_start 10-15.
    // 후보 SQL이 (a, 10-01)을 돌려주면 (10-01, 2)를 2주차로 만든다
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-01' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-15'),
    });
    db.reports.push(reportRow('a', '2026-10-01', 1));
    await generateWeeklyReports(deps, '2026-10-15');
    expect(db.reports[1]).toMatchObject({
      start_date: '2026-10-01',
      week_index: 2,
      display_week: 2,
    });
    expect(deps.fetchWeekData).toHaveBeenCalledWith(
      expect.objectContaining({ baselineStart: '2026-10-01' })
    );
  });

  it('같은 키의 리포트가 있으면 만들지 않는다 (재실행)', async () => {
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
    });
    db.reports.push(reportRow('a', '2026-10-08', 1));
    const result = await generateWeeklyReports(deps, '2026-10-15');
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
    expect(result).toMatchObject({ existing: 1, generated: 0 });
  });

  it('다른 유저의 리포트는 보지 않는다', async () => {
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
    });
    db.reports.push(reportRow('other', '2026-10-01', 2));
    await generateWeeklyReports(deps, '2026-10-15');
    expect(db.reports[1]).toMatchObject({ uid: 'a', display_week: 1 });
  });
});

describe('generateWeeklyReports: 누적 체중 기준은 회차 시작일', () => {
  const weights = [
    { day: '2026-10-01', weight_kg: 72 }, // 회차 시작
    { day: '2026-10-15', weight_kg: 70 },
    { day: '2026-10-21', weight_kg: 69 },
  ];

  it('program_start가 시작일보다 앞이면 그날부터 체중을 읽고 누적 기준으로 쓴다', async () => {
    // 회차 10-01, 한 주 더 하기로 시작일 10-08. 10-22 = 새 시작일 기준 3주차 1일차 → 2주차(10-15~10-21) 리포트
    const { deps, db } = makeDeps({
      fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
      fetchProgramStart: vi.fn(async () => '2026-10-01'),
      fetchWeekData: vi.fn(async () => ({ ...emptyWeek(), weights })),
    });
    await generateWeeklyReports(deps, '2026-10-22');
    expect(deps.fetchProgramStart).toHaveBeenCalledWith('a');
    expect(deps.fetchWeekData).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-10-08', baselineStart: '2026-10-01' })
    );
    expect(db.reports[0].stats.weight.totalDiff).toBe(-3); // 69 - 72
  });

  it('program_start가 없거나 시작일보다 뒤면 시작일 기준 (구버전 앱)', async () => {
    for (const programStart of [null, '2026-10-10']) {
      const { deps } = makeDeps({
        fetchUsers: vi.fn(async () => [{ id: 'a', start_date: '2026-10-08' }]),
        fetchProgramStart: vi.fn(async () => programStart),
      });
      await generateWeeklyReports(deps, '2026-10-22');
      expect(deps.fetchWeekData).toHaveBeenCalledWith(
        expect.objectContaining({ baselineStart: '2026-10-08' })
      );
    }
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
