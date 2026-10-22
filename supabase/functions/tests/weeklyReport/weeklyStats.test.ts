import { describe, expect, it } from 'vitest';
import {
  computeWeeklyStats,
  plannedFastingDays,
  weekRange,
  type WeeklyInputs,
} from '../../_shared/weeklyStats.ts';

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
      successWeekdays: ['금요일'],
    });
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
