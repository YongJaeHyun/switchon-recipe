import { describe, expect, it } from 'vitest';
import {
  computeWeeklyStats,
  plannedFastingDays,
  weekRange,
  type WeeklyInputs,
} from '../../_shared/weeklyStats.ts';
import { scheduleFrom } from '../../_shared/fastingSchedule.ts';

const everyDay = (minutes: number) =>
  Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, minutes]));

// 2026-10-01은 목요일. 2주차 = 10-08(목) ~ 10-14(수)
const base = (over: Partial<WeeklyInputs> = {}): WeeklyInputs => ({
  startDate: '2026-10-01',
  weekIndex: 2,
  weights: [],
  todoDays: [],
  fastingPlannedDays: [],
  fastingResults: [],
  recipes: [],
  foodChecks: [],
  ...over,
});

describe('weekRange', () => {
  it('시작일 기준 7일 (KST 날짜)', () => {
    expect(weekRange('2026-10-01', 1)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(weekRange('2026-10-01', 2)).toEqual({ from: '2026-10-08', to: '2026-10-14' });
  });

  it('월말을 넘겨도 날짜가 맞다', () => {
    expect(weekRange('2026-10-29', 1)).toEqual({ from: '2026-10-29', to: '2026-11-04' });
  });

  it('시각이 붙은 시작일도 날짜만 본다', () => {
    expect(weekRange('2026-10-01T00:00:00+09:00', 2)).toEqual({
      from: '2026-10-08',
      to: '2026-10-14',
    });
  });

  it('시작일을 바꾸면 새 시작일 기준으로 계산한다', () => {
    expect(weekRange('2026-10-12', 1)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });
});

describe('computeWeeklyStats: 체중', () => {
  const weights = [
    { day: '2026-09-30', weight_kg: 72 }, // 시작일 이전 (이전 프로그램)
    { day: '2026-10-01', weight_kg: 70 },
    { day: '2026-10-07', weight_kg: 69.5 },
    { day: '2026-10-09', weight_kg: 69.4 },
    { day: '2026-10-11', weight_kg: 69.0 },
    { day: '2026-10-14', weight_kg: 68.3 },
    { day: '2026-10-15', weight_kg: 60 }, // 다음 주
  ];

  it('주 첫 기록·마지막 기록·diff·기록일 수·시작일 대비 누적', () => {
    const stats = computeWeeklyStats(base({ weights }));
    expect(stats.weekIndex).toBe(2);
    expect(stats.range).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(stats.weight).toEqual({
      start: 69.4,
      end: 68.3,
      diff: -1.1, // 68.3 - 69.4 = -1.1000000000000085 → 소수 한 자리
      daysLogged: 3,
      totalDiff: -1.7, // 68.3 - 70 (시작일 이후 첫 기록)
    });
  });

  it('기록이 없으면 null', () => {
    const stats = computeWeeklyStats(base());
    expect(stats.weight).toEqual({
      start: null,
      end: null,
      diff: null,
      daysLogged: 0,
      totalDiff: null,
    });
  });

  it('기록이 하루뿐이면 diff는 null', () => {
    const stats = computeWeeklyStats(base({ weights: [{ day: '2026-10-10', weight_kg: 70 }] }));
    expect(stats.weight).toMatchObject({ start: 70, end: 70, diff: null, daysLogged: 1 });
  });

  it('입력 순서와 무관하게 날짜순으로 본다', () => {
    const stats = computeWeeklyStats(base({ weights: [...weights].reverse() }));
    expect(stats.weight.start).toBe(69.4);
    expect(stats.weight.end).toBe(68.3);
  });

  it('시작일 변경 직후: 새 시작일 이전 기록은 누적 기준이 아니다', () => {
    const stats = computeWeeklyStats(base({ startDate: '2026-10-09', weekIndex: 1, weights }));
    expect(stats.range).toEqual({ from: '2026-10-09', to: '2026-10-15' });
    expect(stats.weight).toMatchObject({ start: 69.4, end: 60, daysLogged: 4 });
    expect(stats.weight.totalDiff).toBe(-9.4);
  });

  it('누적 기준 시작일(baselineStart, 회차 시작일)을 주면 그날 이후 첫 기록이 기준', () => {
    // 회차 09-30, 한 주 더 하기 등으로 시작일 10-09
    const stats = computeWeeklyStats(
      base({
        startDate: '2026-10-09',
        weekIndex: 1,
        baselineStart: '2026-09-30',
        weights,
      })
    );
    expect(stats.weight.totalDiff).toBe(-12); // 60 - 72 (09-30 기록)
  });
});

describe('computeWeeklyStats: 할 일', () => {
  const A = '아침 프로틴쉐이크 마시기';
  const B = '점심 저탄수식 먹기';
  const C = '저녁 프로틴쉐이크 마시기';

  const todoDays = [
    { day: '2026-10-08', items: [A, B, C], checked: [0, 1, 2] }, // 목 100%
    { day: '2026-10-09', items: [A, B, C], checked: [0] }, // 금 33%
    { day: '2026-10-10', items: [A, B], checked: [0, 1] }, // 토 100% (단식일: C 빠짐)
    { day: '2026-10-11', items: [C], checked: [] }, // 일 0% (단식 다음날)
    { day: '2026-10-15', items: [A], checked: [0] }, // 다음 주
  ];

  it('항목별 done/appeared: 목록에 없던 날은 분모에 안 센다', () => {
    const stats = computeWeeklyStats(base({ todoDays }));
    expect(stats.todo.items).toEqual([
      { name: A, done: 3, appeared: 3 },
      { name: B, done: 2, appeared: 3 },
      { name: C, done: 1, appeared: 3 },
    ]);
  });

  it('평균·최고·최저 (한국어 요일)', () => {
    const stats = computeWeeklyStats(base({ todoDays }));
    // (100 + 33.3 + 100 + 0) / 4 = 58.3 → 58
    expect(stats.todo.avgRate).toBe(58);
    expect(stats.todo.best).toEqual({ day: '2026-10-08', weekday: '목요일', rate: 100 });
    expect(stats.todo.worst).toEqual({ day: '2026-10-11', weekday: '일요일', rate: 0 });
  });

  it('기록이 없으면 null과 빈 목록', () => {
    const stats = computeWeeklyStats(base());
    expect(stats.todo).toEqual({ avgRate: null, best: null, worst: null, items: [] });
  });

  it('하루만 기록했으면 최저는 없다', () => {
    const stats = computeWeeklyStats(base({ todoDays: [todoDays[1]] }));
    expect(stats.todo.best).toEqual({ day: '2026-10-09', weekday: '금요일', rate: 33 });
    expect(stats.todo.worst).toBeNull();
  });

  it('모든 날의 달성률이 같으면 최저는 없다', () => {
    const stats = computeWeeklyStats(
      base({
        todoDays: [
          { day: '2026-10-08', items: [A], checked: [0] },
          { day: '2026-10-09', items: [A], checked: [0] },
        ],
      })
    );
    expect(stats.todo.best).toEqual({ day: '2026-10-08', weekday: '목요일', rate: 100 });
    expect(stats.todo.worst).toBeNull();
  });

  it('범위 밖 인덱스와 중복 체크는 무시한다', () => {
    const stats = computeWeeklyStats(
      base({ todoDays: [{ day: '2026-10-08', items: [A, B], checked: [0, 0, 5, -1] }] })
    );
    expect(stats.todo.avgRate).toBe(50);
    expect(stats.todo.items).toEqual([
      { name: A, done: 1, appeared: 1 },
      { name: B, done: 0, appeared: 1 },
    ]);
  });
});

describe('computeWeeklyStats: 단식', () => {
  it('계획 2·성공 1·기록 없음 1 → planned 2, success 1, broken 0', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-09', '2026-10-12'],
        fastingResults: [
          { day: '2026-10-09', result: 'success' },
          { day: '2026-10-05', result: 'broken' }, // 지난 주
        ],
      })
    );
    expect(stats.fasting).toEqual({
      planned: 2,
      success: 1,
      broken: 0,
      pending: 0,
      successWeekdays: ['금요일'],
      earlyEnded: [],
    });
  });

  it('계획에 없던 날의 결과도 계획으로 센다 (planned >= success + broken)', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: [],
        fastingResults: [{ day: '2026-10-09', result: 'success' }],
      })
    );
    expect(stats.fasting).toMatchObject({ planned: 1, success: 1, broken: 0 });

    const changed = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-12'],
        fastingResults: [
          { day: '2026-10-09', result: 'broken' },
          { day: '2026-10-12', result: 'success' },
        ],
      })
    );
    expect(changed.fasting).toMatchObject({ planned: 2, success: 1, broken: 1 });
  });

  it('중단도 센다', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-09', '2026-10-12'],
        fastingResults: [
          { day: '2026-10-09', result: 'broken' },
          { day: '2026-10-12', result: 'success' },
        ],
      })
    );
    expect(stats.fasting).toMatchObject({ planned: 2, success: 1, broken: 1 });
    expect(stats.fasting.successWeekdays).toEqual(['월요일']);
  });
});

describe('computeWeeklyStats: 일찍 끝낸 단식', () => {
  it('일찍 끝낸(broken) 단식의 요일과 단식한 시간(분)을 날짜순으로, 옛 기록은 시간 없이', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12'],
        fastingResults: [
          { day: '2026-10-12', result: 'broken', fastedMinutes: 990 },
          { day: '2026-10-08', result: 'broken', fastedMinutes: 1080 },
          { day: '2026-10-09', result: 'success', fastedMinutes: null },
          { day: '2026-10-10', result: 'broken' }, // 옛 앱 기록 (시간 없음)
          { day: '2026-10-05', result: 'broken', fastedMinutes: 600 }, // 지난 주
        ],
      })
    );
    expect(stats.fasting.broken).toBe(3);
    expect(stats.fasting.earlyEnded).toEqual([
      { weekday: '목요일', fastedMinutes: 1080 },
      { weekday: '토요일', fastedMinutes: null },
      { weekday: '월요일', fastedMinutes: 990 },
    ]);
  });

  it('범위를 벗어난 시간 값은 시간 없음으로 본다', () => {
    const stats = computeWeeklyStats(
      base({
        fastingResults: [
          { day: '2026-10-08', result: 'broken', fastedMinutes: 5000 },
          { day: '2026-10-09', result: 'broken', fastedMinutes: -1 },
          { day: '2026-10-10', result: 'broken', fastedMinutes: 0 }, // "0분"이 되지 않게
        ],
      })
    );
    expect(stats.fasting.earlyEnded.map((e) => e.fastedMinutes)).toEqual([null, null, null]);
  });
});

describe('computeWeeklyStats: 단식 응답 대기 (pending)', () => {
  // 2주차 = 10-08(목) ~ 10-14(수). 리포트는 10-15(목) 08:00 KST에 만든다
  const at = (iso: string) => new Date(iso);
  const REPORT_TIME = at('2026-10-14T23:00:00Z'); // 10-15 08:00 KST

  it('주 마지막 날 저녁 단식은 생성 시점에 아직 응답 대기', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-14'],
        fastingSchedule: everyDay(1140),
        now: REPORT_TIME,
      })
    );
    expect(stats.fasting).toMatchObject({ planned: 1, success: 0, broken: 0, pending: 1 });
  });

  it('응답 창(시작 후 72시간)이 닫혔으면 대기가 아니다', () => {
    // 10-14 09:00 시작 → 10-17 09:00까지
    const input = base({ fastingPlannedDays: ['2026-10-14'], fastingSchedule: everyDay(540) });
    expect(computeWeeklyStats({ ...input, now: at('2026-10-16T23:59:00Z') }).fasting.pending).toBe(
      1
    ); // 10-17 08:59 KST
    expect(computeWeeklyStats({ ...input, now: at('2026-10-17T00:00:00Z') }).fasting.pending).toBe(
      0
    ); // 10-17 09:00 KST
  });

  it('다음 단식이 시작되면 앞 단식의 응답 창은 닫힌다 (앱 fastingResultWindow와 같음)', () => {
    // 10-12(월) 19:00 단식 창은 10-14(수) 19:00 단식 시작으로 닫힌다
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-12', '2026-10-14'],
        fastingSchedule: everyDay(1140),
        now: REPORT_TIME,
      })
    );
    expect(stats.fasting).toMatchObject({ planned: 2, pending: 1 });
  });

  it('결과가 있는 단식은 대기가 아니다', () => {
    const stats = computeWeeklyStats(
      base({
        fastingPlannedDays: ['2026-10-14'],
        fastingResults: [{ day: '2026-10-14', result: 'success' }],
        fastingSchedule: everyDay(1140),
        now: REPORT_TIME,
      })
    );
    expect(stats.fasting).toMatchObject({ planned: 1, success: 1, pending: 0 });
  });

  it('라벨만 있는 계획은 scheduleFrom을 거쳐도 이전 결과와 같다', () => {
    const days = [0, 1, 2, 3, 4, 5, 6];
    const plan = (start_time: string, ...planned: string[]) =>
      computeWeeklyStats(
        base({
          fastingPlannedDays: planned,
          fastingSchedule: scheduleFrom({ days, start_time, start_minutes: null }),
          now: REPORT_TIME,
        })
      ).fasting.pending;
    expect(plan('저녁 식후', '2026-10-14')).toBe(1);
    expect(plan('저녁 식후', '2026-10-12', '2026-10-14')).toBe(1);
    expect(plan('아침 식후', '2026-10-14')).toBe(1); // 10-17 09:00까지
    expect(plan('아침 식후', '2026-10-10')).toBe(0); // 10-13 09:00에 닫힘
  });

  it('요일마다 다른 시각이면 각 요일 시각으로 응답 창을 잰다', () => {
    // 목(10-08) 13:00 시작 → 10-11 13:00까지, 토(10-10) 19:00 시작 → 10-13 19:00까지
    const schedule = { 4: 780, 6: 1140 };
    const pending = (planned: string[], now: string) =>
      computeWeeklyStats(
        base({ fastingPlannedDays: planned, fastingSchedule: schedule, now: at(now) })
      ).fasting.pending;
    // 목 단식만: 10-11 12:59 KST(03:59Z)까지 대기, 13:00부터 아님
    expect(pending(['2026-10-08'], '2026-10-11T03:59:00Z')).toBe(1);
    expect(pending(['2026-10-08'], '2026-10-11T04:00:00Z')).toBe(0);
    // 토 단식만: 10-13 18:59 KST(09:59Z)까지 대기
    expect(pending(['2026-10-10'], '2026-10-13T09:59:00Z')).toBe(1);
    expect(pending(['2026-10-10'], '2026-10-13T10:00:00Z')).toBe(0);
    // 둘 다 계획: 토 18:00 KST엔 목 창(토 19:00 시작으로 닫힘)과 토 창 모두 열림, 19:00부터 목은 닫힘
    const both = ['2026-10-08', '2026-10-10'];
    expect(pending(both, '2026-10-10T09:59:00Z')).toBe(2);
    expect(pending(both, '2026-10-10T10:00:00Z')).toBe(1);
  });

  it('요일별 시각이 다음 단식 시작 판단에도 쓰인다', () => {
    // 월(10-12) 22:00 시작, 수(10-14) 07:00 시작이면 월 단식 창은 수 07:00에 닫힌다
    const schedule = { 1: 1320, 3: 420 };
    const planned = ['2026-10-12', '2026-10-14'];
    const run = (now: string) =>
      computeWeeklyStats(
        base({ fastingPlannedDays: planned, fastingSchedule: schedule, now: at(now) })
      ).fasting.pending;
    expect(run('2026-10-13T21:00:00Z')).toBe(2); // 수 06:00 KST: 월 창 열림 + 수 단식(시작 전)
    expect(run('2026-10-13T22:30:00Z')).toBe(1); // 수 07:30 KST: 월 창은 수 07:00에 닫혀 수만 대기
  });

  it('계획 요일이 지도에 없으면 대기로 세지 않고 앞 단식의 경계로도 쓰지 않는다', () => {
    const run = (planned: string[], schedule: Record<number, number>, now: string) =>
      computeWeeklyStats(
        base({ fastingPlannedDays: planned, fastingSchedule: schedule, now: at(now) })
      ).fasting.pending;
    // 수(3)는 지도에 없고 목(4)만 있음 → 수 단식은 시작 시각을 몰라 대기가 아니다
    expect(run(['2026-10-14'], { 4: 540 }, '2026-10-14T23:00:00Z')).toBe(0);
    // 월(10-12) 19:00 단식은 시각 없는 수(10-14)에 닫히지 않고 72시간(10-15 19:00)까지 대기
    expect(run(['2026-10-12', '2026-10-14'], { 1: 1140 }, '2026-10-14T23:00:00Z')).toBe(1);
  });

  it('시작 시간을 모르면(앱도 응답을 묻지 않음) 대기로 세지 않는다', () => {
    for (const fastingSchedule of [{}, undefined]) {
      const stats = computeWeeklyStats(
        base({ fastingPlannedDays: ['2026-10-14'], fastingSchedule, now: REPORT_TIME })
      );
      expect(stats.fasting.pending).toBe(0);
    }
  });
});

describe('computeWeeklyStats: 레시피·판정 (UTC → KST 날짜)', () => {
  const recipes = [
    { created_at: '2026-10-07T14:59:00Z', is_zero_carb: false }, // KST 10-07 23:59 → 지난 주
    { created_at: '2026-10-07T15:00:00Z', is_zero_carb: false }, // KST 10-08 00:00 → 포함
    { created_at: '2026-10-10T03:00:00+00:00', is_zero_carb: true },
    { created_at: '2026-10-14T14:30:00Z', is_zero_carb: true }, // KST 10-14 23:30 → 포함
    { created_at: '2026-10-14T15:30:00Z', is_zero_carb: false }, // KST 10-15 00:30 → 다음 주
  ];

  it('범위 안만 센다 (주 마지막 날 23:30 KST는 이번 주)', () => {
    const stats = computeWeeklyStats(base({ recipes }));
    expect(stats.recipes).toEqual({ total: 3, low: 1, zero: 2 });
  });

  it('UTC 일요일 15:30 = KST 월요일 00:30 → 다음 주', () => {
    // 2026-10-05(월) 시작 → 1주차 = 10-05(월) ~ 10-11(일)
    const stats = computeWeeklyStats(
      base({
        startDate: '2026-10-05',
        weekIndex: 1,
        recipes: [
          { created_at: '2026-10-11T14:30:00Z', is_zero_carb: false }, // KST 일 23:30
          { created_at: '2026-10-11T15:30:00Z', is_zero_carb: false }, // KST 월 00:30
        ],
        foodChecks: [
          { created_at: '2026-10-11T14:30:00Z', verdict: 'avoid' },
          { created_at: '2026-10-11T15:30:00Z', verdict: 'avoid' },
          { created_at: '2026-10-05T00:00:00Z', verdict: 'ok' },
        ],
      })
    );
    expect(stats.recipes).toEqual({ total: 1, low: 1, zero: 0 });
    expect(stats.foodChecks).toEqual({ total: 2, avoid: 1 });
  });
});

describe('computeWeeklyStats: isEmpty', () => {
  it('체중 0일 + 할 일 체크 0일이면 비어 있다', () => {
    expect(computeWeeklyStats(base()).isEmpty).toBe(true);
    expect(
      computeWeeklyStats(
        base({
          todoDays: [{ day: '2026-10-08', items: ['a'], checked: [] }],
          recipes: [{ created_at: '2026-10-08T03:00:00Z', is_zero_carb: false }],
          fastingResults: [{ day: '2026-10-09', result: 'success' }],
        })
      ).isEmpty
    ).toBe(true);
  });

  it('체중이나 할 일 체크가 하루라도 있으면 비어 있지 않다', () => {
    expect(
      computeWeeklyStats(base({ weights: [{ day: '2026-10-08', weight_kg: 70 }] })).isEmpty
    ).toBe(false);
    expect(
      computeWeeklyStats(base({ todoDays: [{ day: '2026-10-08', items: ['a'], checked: [0] }] }))
        .isEmpty
    ).toBe(false);
  });

  it('범위 밖 기록만 있으면 비어 있다', () => {
    expect(
      computeWeeklyStats(
        base({
          weights: [{ day: '2026-10-07', weight_kg: 70 }],
          todoDays: [{ day: '2026-10-15', items: ['a'], checked: [0] }],
        })
      ).isEmpty
    ).toBe(true);
  });
});

describe('plannedFastingDays', () => {
  // 2주차 = 10-08(목) ~ 10-14(수). 요일 번호 0=일 (앱 FASTING_DAYS와 같음)
  const range = { from: '2026-10-08', to: '2026-10-14' };

  it('범위 안에서 단식 요일인 날짜 (날짜순)', () => {
    expect(plannedFastingDays(range, [1, 5], 3)).toEqual(['2026-10-09', '2026-10-12']);
  });

  it('일요일은 0', () => {
    expect(plannedFastingDays(range, [0], 2)).toEqual(['2026-10-11']);
  });

  it('1주차에는 단식이 없다', () => {
    expect(plannedFastingDays({ from: '2026-10-01', to: '2026-10-07' }, [1], 1)).toEqual([]);
  });

  it('단식 요일이 없으면 빈 배열', () => {
    expect(plannedFastingDays(range, null, 2)).toEqual([]);
    expect(plannedFastingDays(range, [], 2)).toEqual([]);
  });

  it('잘못된 요일 번호와 중복은 무시한다', () => {
    expect(plannedFastingDays(range, [5, 5, 7, -1], 2)).toEqual(['2026-10-09']);
  });
});

describe('computeWeeklyStats: 반올림 (리뷰 M-6)', () => {
  it('지수 표기로 찍히는 아주 작은 차이도 NaN이 아니라 0으로 반올림한다', () => {
    const stats = computeWeeklyStats(
      base({
        weights: [
          { day: '2026-10-08', weight_kg: 70 },
          { day: '2026-10-14', weight_kg: 70.0000001 },
        ],
      })
    );
    expect(stats.weight.diff).toBe(0);
  });

  it('부동소수 오차가 있는 차이도 소수 한 자리로 맞춘다', () => {
    const stats = computeWeeklyStats(
      base({
        weights: [
          { day: '2026-10-08', weight_kg: 69.4 },
          { day: '2026-10-14', weight_kg: 68.2 },
        ],
      })
    );
    expect(stats.weight.diff).toBe(-1.2);
  });
});
