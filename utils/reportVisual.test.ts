import { describe, expect, it } from 'vitest';
import {
  dailyTodoBars,
  fastingDots,
  itemProgress,
  rangeDays,
  liveWeekWeight,
  weekWeightPoints,
  weightHintState,
} from './reportVisual';

// 2026-10-21은 수요일
const RANGE = { from: '2026-10-21', to: '2026-10-27' };

const fasting = (over: Partial<Parameters<typeof fastingDots>[0]['fasting']> = {}) => ({
  planned: 0,
  success: 0,
  broken: 0,
  pending: 0,
  successWeekdays: [],
  ...over,
});

describe('rangeDays', () => {
  it('기간의 7일과 요일 한 글자', () => {
    expect(rangeDays(RANGE)).toEqual([
      { day: '2026-10-21', weekday: '수' },
      { day: '2026-10-22', weekday: '목' },
      { day: '2026-10-23', weekday: '금' },
      { day: '2026-10-24', weekday: '토' },
      { day: '2026-10-25', weekday: '일' },
      { day: '2026-10-26', weekday: '월' },
      { day: '2026-10-27', weekday: '화' },
    ]);
  });
  it('기간이 거꾸로면 빈 배열', () =>
    expect(rangeDays({ from: '2026-10-27', to: '2026-10-21' })).toEqual([]));
});

describe('dailyTodoBars', () => {
  it('기록이 하나도 없으면 null (그래프 숨김)', () => {
    expect(dailyTodoBars(RANGE, [])).toBeNull();
    expect(dailyTodoBars(RANGE, [{ day: '2026-10-20', items: ['a'], checked: [0] }])).toBeNull();
  });

  it('날짜별 완료율, 기록 없는 날은 null, 가장 높은 날 하나만 강조', () => {
    const bars = dailyTodoBars(RANGE, [
      { day: '2026-10-21', items: ['a', 'b', 'c', 'd'], checked: [0] },
      { day: '2026-10-23', items: ['a', 'b'], checked: [0, 1] },
      { day: '2026-10-24', items: ['a', 'b'], checked: [1, 0] },
      { day: '2026-10-28', items: ['a'], checked: [0] }, // 기간 밖
    ]);
    expect(bars).toHaveLength(7);
    expect(bars!.map((b) => b.rate)).toEqual([25, null, 100, 100, null, null, null]);
    expect(bars!.map((b) => b.isBest)).toEqual([false, false, true, false, false, false, false]);
    expect(bars![0]).toMatchObject({ day: '2026-10-21', weekday: '수', height: 0.25 });
    expect(bars![1].height).toBe(0);
  });

  it('범위 밖·중복 체크 번호는 세지 않는다 (서버 계산과 같게)', () => {
    const bars = dailyTodoBars(RANGE, [
      { day: '2026-10-22', items: ['a', 'b', 'c'], checked: [0, 0, 5, -1] },
    ]);
    expect(bars![1].rate).toBe(33);
  });

  it('항목이 빈 날은 기록 없음으로 본다', () => {
    expect(dailyTodoBars(RANGE, [{ day: '2026-10-22', items: [], checked: [] }])).toBeNull();
  });

  it('모두 0%면 강조하지 않는다', () => {
    const bars = dailyTodoBars(RANGE, [{ day: '2026-10-22', items: ['a'], checked: [] }]);
    expect(bars!.some((b) => b.isBest)).toBe(false);
    expect(bars![1].rate).toBe(0);
  });
});

describe('weekWeightPoints', () => {
  it('기간 안 기록만 날짜순, 2개 미만이면 빈 배열', () => {
    expect(
      weekWeightPoints(RANGE, [
        { day: '2026-10-20', weight_kg: 70 },
        { day: '2026-10-22', weight_kg: 69.5 },
      ])
    ).toEqual([]);
    expect(
      weekWeightPoints(RANGE, [
        { day: '2026-10-25', weight_kg: 69.1 },
        { day: '2026-10-21', weight_kg: 70 },
        { day: '2026-10-28', weight_kg: 68 },
      ])
    ).toEqual([
      { day: '2026-10-21', label: '10/21', value: 70 },
      { day: '2026-10-25', label: '10/25', value: 69.1 },
    ]);
  });
});

describe('itemProgress', () => {
  it('항목별 완료 비율(0~1)과 %', () => {
    expect(
      itemProgress([
        { name: '아침 쉐이크', done: 1, appeared: 4 },
        { name: '물 2L', done: 7, appeared: 7 },
        { name: '없음', done: 0, appeared: 0 },
      ])
    ).toEqual([
      { name: '아침 쉐이크', done: 1, appeared: 4, ratio: 0.25, percent: 25 },
      { name: '물 2L', done: 7, appeared: 7, ratio: 1, percent: 100 },
      { name: '없음', done: 0, appeared: 0, ratio: 0, percent: 0 },
    ]);
  });
});

describe('fastingDots', () => {
  const now = new Date('2026-10-28T03:00:00Z'); // 10/28 12:00 KST

  it('앱 기록이 있으면 그 주 단식일마다 성공·일찍 끝냄·결과 없음·응답 대기', () => {
    expect(
      fastingDots({
        range: RANGE,
        now,
        fasting: fasting({ planned: 4 }),
        items: [
          { day: '2026-10-26', result: null, inProgress: false }, // 월: 10/30 0시 KST 전 → 대기
          { day: '2026-10-22', result: 'broken', inProgress: false },
          { day: '2026-10-21', result: 'success', inProgress: false },
          { day: '2026-10-23', result: null, inProgress: false }, // 금: 응답 기간 지남
          { day: '2026-10-29', result: 'success', inProgress: false }, // 기간 밖
        ],
      })
    ).toEqual([
      { day: '2026-10-21', weekday: '수', kind: 'success' },
      { day: '2026-10-22', weekday: '목', kind: 'early' },
      { day: '2026-10-23', weekday: '금', kind: 'missed' },
      { day: '2026-10-26', weekday: '월', kind: 'pending' },
    ]);
  });

  it('진행 중인 단식은 대기', () => {
    expect(
      fastingDots({
        range: RANGE,
        now,
        fasting: fasting(),
        items: [{ day: '2026-10-21', result: null, inProgress: true }],
      })
    ).toEqual([{ day: '2026-10-21', weekday: '수', kind: 'pending' }]);
  });

  it('앱 기록이 없으면(못 받음·지난 프로그램) 리포트 숫자의 요일로', () => {
    expect(
      fastingDots({
        range: RANGE,
        now,
        items: null,
        fasting: fasting({
          planned: 3,
          success: 1,
          broken: 1,
          successWeekdays: ['월요일'],
          earlyEnded: [{ weekday: '목요일', fastedMinutes: 600 }],
        }),
      })
    ).toEqual([
      { day: '2026-10-22', weekday: '목', kind: 'early' },
      { day: '2026-10-26', weekday: '월', kind: 'success' },
    ]);
  });

  it('그 주 앱 기록이 비어도 리포트 숫자로', () => {
    expect(
      fastingDots({
        range: RANGE,
        now,
        items: [],
        fasting: fasting({ planned: 1, success: 1, successWeekdays: ['수요일'] }),
      })
    ).toEqual([{ day: '2026-10-21', weekday: '수', kind: 'success' }]);
  });

  it('earlyEnded가 없는 옛 리포트도 죽지 않는다', () => {
    expect(
      fastingDots({ range: RANGE, now, items: null, fasting: fasting({ planned: 2, broken: 1 }) })
    ).toEqual([]);
  });
});

describe('liveWeekWeight', () => {
  const logs = [
    { day: '2026-10-14', weight_kg: 72 }, // 프로그램 시작 무렵 (누적 기준)
    { day: '2026-10-21', weight_kg: 70 },
    { day: '2026-10-24', weight_kg: 69.2 },
    { day: '2026-10-28', weight_kg: 68 }, // 기간 밖
  ];

  it('기간 안 기록으로 서버와 같은 계산 (처음·끝·차이·기록 일수·누적)', () => {
    expect(liveWeekWeight({ range: RANGE, logs, baselineStart: '2026-10-14' })).toEqual({
      start: 70,
      end: 69.2,
      diff: -0.8,
      daysLogged: 2,
      totalDiff: -2.8,
    });
  });

  it('하루만 적었으면 차이는 null', () => {
    expect(liveWeekWeight({ range: RANGE, logs: [logs[1]], baselineStart: '2026-10-14' })).toEqual({
      start: 70,
      end: 70,
      diff: null,
      daysLogged: 1,
      totalDiff: 0,
    });
  });

  it('기록이 없으면 모두 비움', () => {
    expect(liveWeekWeight({ range: RANGE, logs: [], baselineStart: '2026-10-14' })).toEqual({
      start: null,
      end: null,
      diff: null,
      daysLogged: 0,
      totalDiff: null,
    });
  });

  it('누적 기준 시작일보다 앞선 기록은 기준으로 쓰지 않는다', () => {
    expect(liveWeekWeight({ range: RANGE, logs, baselineStart: '2026-10-21' }).totalDiff).toBe(
      -0.8
    );
  });
});

describe('weightHintState', () => {
  const base = {
    range: RANGE,
    storedDaysLogged: 2,
    canRegenerate: false,
    hasAccess: true,
    isCurrentProgram: true,
    logs: [
      { day: '2026-10-21', weight_kg: 70 },
      { day: '2026-10-23', weight_kg: 69.8 },
    ],
    allowedRange: { from: '2026-09-30', to: '2026-11-01' },
  };
  const fullWeek = rangeDays(RANGE).map(({ day }) => ({ day, weight_kg: 70 }));

  it('A: 지금 기록이 7일 미만이면 n일과 첫 빠진 날', () => {
    expect(weightHintState(base)).toEqual({
      kind: 'missing',
      daysLogged: 2,
      targetDay: '2026-10-22',
    });
    expect(weightHintState({ ...base, logs: [], storedDaysLogged: 0 })).toEqual({
      kind: 'missing',
      daysLogged: 0,
      targetDay: '2026-10-21',
    });
  });

  it('B: 리포트 때보다 기록이 늘고 서버가 다시 만들기를 허락하면 a일 → b일', () => {
    const logs = [...base.logs, { day: '2026-10-22', weight_kg: 69.9 }];
    expect(weightHintState({ ...base, logs, canRegenerate: true })).toEqual({
      kind: 'added',
      before: 2,
      after: 3,
    });
    expect(weightHintState({ ...base, logs: fullWeek, canRegenerate: true })).toEqual({
      kind: 'added',
      before: 2,
      after: 7,
    });
  });

  it('기록이 늘지 않았으면 서버가 허락해도 A (다른 기록 때문인 다시 만들기는 아래 버튼)', () => {
    expect(weightHintState({ ...base, canRegenerate: true })).toMatchObject({ kind: 'missing' });
  });

  it('늘었어도 서버가 막으면 A, 7일을 다 채웠으면 숨김', () => {
    const logs = [...base.logs, { day: '2026-10-22', weight_kg: 69.9 }];
    expect(weightHintState({ ...base, logs })).toMatchObject({ kind: 'missing', daysLogged: 3 });
    expect(weightHintState({ ...base, logs: fullWeek })).toBeNull();
  });

  it('패스 없음·지난 프로그램이면 숨김', () => {
    expect(weightHintState({ ...base, hasAccess: false })).toBeNull();
    expect(weightHintState({ ...base, isCurrentProgram: false })).toBeNull();
  });

  it('시트가 고를 수 있는 날만: 앞쪽이 범위 밖이면 그 뒤 빠진 날, 없으면 숨김', () => {
    expect(
      weightHintState({
        ...base,
        logs: [],
        allowedRange: { from: '2026-10-24', to: '2026-11-01' },
      })
    ).toMatchObject({ targetDay: '2026-10-24' });
    expect(
      weightHintState({
        ...base,
        logs: [],
        allowedRange: { from: '2026-10-28', to: '2026-11-01' },
      })
    ).toBeNull();
  });
});
