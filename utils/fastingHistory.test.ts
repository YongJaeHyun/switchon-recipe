import { describe, expect, it } from 'vitest';
import { fastingHistory, formatHistoryDay } from './fastingHistory';

const startDate = '2026-10-15';
const week2Thu = { week_index: 2, days: [4], start_time: '저녁 식후' };

type Args = Parameters<typeof fastingHistory>[0];
// 시작일 하나뿐인 회차(예전 동작): 계획은 모두 지금 시작일 것, 회차 시작일 = 시작일
const currentOf = ({
  plans,
  ...rest
}: Omit<Args, 'plans' | 'programStart'> & {
  plans: Omit<Args['plans'][number], 'start_date'>[];
}) =>
  fastingHistory({
    ...rest,
    programStart: null,
    plans: plans.map((plan) => ({ ...plan, start_date: rest.startDate })),
  }).current;

describe('fastingHistory (시작일 하나)', () => {
  it('단식이 시작된 계획일은 결과 없이 나온다', () => {
    expect(
      currentOf({
        startDate,
        plans: [week2Thu],
        results: [],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: null, fastedMinutes: null, inProgress: true },
    ]);
  });

  it('결과가 있으면 함께 나온다', () => {
    expect(
      currentOf({
        startDate,
        plans: [week2Thu],
        results: [{ day: '2026-10-22', result: 'success' }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: 'success', fastedMinutes: null, inProgress: true },
    ]);
  });

  it('아직 시작 전인 계획일은 빠진다', () => {
    expect(
      currentOf({
        startDate,
        plans: [week2Thu],
        results: [],
        now: new Date('2026-10-22T18:00+09:00'),
      })
    ).toEqual([]);
  });

  it('계획에서 빠진 날의 결과도 나오고, 최근순이다', () => {
    expect(
      currentOf({
        startDate,
        plans: [week2Thu],
        results: [{ day: '2026-10-26', result: 'broken' }],
        now: new Date('2026-10-27T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-26', weekIndex: 2, result: 'broken', fastedMinutes: null, inProgress: false },
      { day: '2026-10-22', weekIndex: 2, result: null, fastedMinutes: null, inProgress: false },
    ]);
  });

  it('시작일 이전 결과는 빠진다', () => {
    expect(
      currentOf({
        startDate,
        plans: [],
        results: [{ day: '2026-10-10', result: 'success' }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([]);
  });

  it('1주차(단식 없음) 날짜의 결과는 이전 프로그램 것이라 빠진다', () => {
    expect(
      currentOf({
        startDate,
        plans: [],
        results: [
          { day: '2026-10-21', result: 'success' },
          { day: '2026-10-22', result: 'broken' },
        ],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: 'broken', fastedMinutes: null, inProgress: false },
    ]);
  });

  it('계획·결과가 없으면 빈 목록', () => {
    expect(
      currentOf({ startDate, plans: [], results: [], now: new Date('2026-10-23T09:00+09:00') })
    ).toEqual([]);
  });

  it('시작 시각이 없으면 그날 자정부터 시작으로 본다', () => {
    expect(
      currentOf({
        startDate,
        plans: [{ week_index: 2, days: [4], start_time: null }],
        results: [],
        now: new Date('2026-10-22T00:30+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: null, fastedMinutes: null, inProgress: true },
    ]);
  });

  it('요일별 시작 시각(start_minutes)이 라벨보다 우선한다', () => {
    const plans = [
      { week_index: 2, days: [4], start_time: '저녁 식후', start_minutes: { '4': 780 } },
    ];
    expect(
      currentOf({ startDate, plans, results: [], now: new Date('2026-10-22T12:59+09:00') })
    ).toEqual([]);
    expect(
      currentOf({ startDate, plans, results: [], now: new Date('2026-10-22T13:00+09:00') })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: null, fastedMinutes: null, inProgress: true },
    ]);
  });

  it('22:00 시작은 KST 날짜로 그날에 들어간다', () => {
    const plans = [{ week_index: 2, days: [4], start_time: null, start_minutes: { '4': 1320 } }];
    expect(
      currentOf({ startDate, plans, results: [], now: new Date('2026-10-22T21:59+09:00') })
    ).toEqual([]);
    // KST 목 22:00 = UTC 목 13:00
    expect(
      currentOf({ startDate, plans, results: [], now: new Date('2026-10-22T13:00:00Z') })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: null, fastedMinutes: null, inProgress: true },
    ]);
  });

  it('일찍 끝낸 단식은 단식한 시간(분)이 함께 나온다', () => {
    expect(
      currentOf({
        startDate,
        plans: [week2Thu],
        results: [{ day: '2026-10-22', result: 'broken', fastedMinutes: 990 }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: 'broken', fastedMinutes: 990, inProgress: true },
    ]);
  });

  it('시작부터 24시간 안이면 진행 중(inProgress), 24시간이 지나면 아니다 (최종 리뷰 M5)', () => {
    const at = (iso: string) =>
      currentOf({ startDate, plans: [week2Thu], results: [], now: new Date(iso) })[0].inProgress;
    expect(at('2026-10-22T19:00+09:00')).toBe(true);
    expect(at('2026-10-23T18:59+09:00')).toBe(true);
    expect(at('2026-10-23T19:00+09:00')).toBe(false);
  });
});

const item = (day: string, weekIndex: number, result: 'success' | 'broken' | null = null) => ({
  day,
  weekIndex,
  result,
  fastedMinutes: null,
  inProgress: false,
});

describe('fastingHistory (회차)', () => {
  const now = new Date('2026-10-30T09:00+09:00');

  it('한 주 더 하기로 시작일이 밀려도 이전 시작일의 단식이 지금 회차에 이어진다', () => {
    // 10/1 시작 → 2주차 목(10/8) 단식 → 한 주 더(시작일 10/8) → 다시 2주차 목(10/15)
    const { current, previous } = fastingHistory({
      startDate: '2026-10-08',
      programStart: '2026-10-01',
      plans: [
        { start_date: '2026-10-01', ...week2Thu },
        { start_date: '2026-10-08', ...week2Thu },
      ],
      results: [
        { day: '2026-10-08', result: 'success' },
        { day: '2026-10-15', result: 'broken' },
      ],
      now,
    });
    expect(current).toEqual([item('2026-10-15', 2, 'broken'), item('2026-10-08', 2, 'success')]);
    expect(previous).toEqual([]);
  });

  it('계획 없이 결과만 있는 날도 그 날이 2주차 이상이 되는 시작일로 주차를 센다', () => {
    const { current } = fastingHistory({
      startDate: '2026-10-08',
      programStart: '2026-10-01',
      plans: [],
      results: [
        { day: '2026-10-09', result: 'success' }, // 10/8 기준 1주차, 10/1 기준 2주차
        { day: '2026-10-16', result: 'success' }, // 10/8 기준 2주차
        { day: '2026-10-03', result: 'success' }, // 어느 시작일로도 1주차 → 이전 회차 것
      ],
      now,
    });
    expect(current).toEqual([item('2026-10-16', 2, 'success'), item('2026-10-09', 2, 'success')]);
  });

  it('주차 맞추기로 시작일을 앞당겨도 예전 시작일의 계획일이 남는다', () => {
    // 10/15 시작 2주차 목(10/22) 단식 → 주차 맞추기로 10/8 시작 (회차 시작일도 10/8)
    const { current } = fastingHistory({
      startDate: '2026-10-08',
      programStart: '2026-10-08',
      plans: [{ start_date: '2026-10-15', ...week2Thu }],
      results: [],
      now,
    });
    expect(current).toEqual([item('2026-10-22', 2)]);
  });

  it('program_start가 없으면 start_date가 회차 시작일 (예전처럼 그 전 단식은 지금 회차가 아니다)', () => {
    const { current, previous } = fastingHistory({
      startDate: '2026-10-08',
      programStart: null,
      plans: [
        { start_date: '2026-10-01', ...week2Thu },
        { start_date: '2026-10-08', ...week2Thu },
      ],
      results: [{ day: '2026-10-08', result: 'success' }],
      now,
    });
    // 10/8 결과는 10/8 기준 1주차라 빠지고, 10/1 묶음에는 10/8 전까지 기록이 없어 묶음도 없다
    expect(current).toEqual([item('2026-10-15', 2)]);
    expect(previous).toEqual([]);
  });

  it('지난 회차는 시작일 묶음별로, 다음 회차 시작 전까지의 기록만 (최신 회차 먼저)', () => {
    const mon = { week_index: 2, days: [1], start_time: null };
    const { current, previous } = fastingHistory({
      startDate: '2026-10-01',
      programStart: '2026-10-01',
      plans: [
        { start_date: '2025-08-04', ...mon }, // 2주차 월 8/11
        { start_date: '2025-08-11', ...mon }, // 한 주 더 → 2주차 월 8/18
        { start_date: '2026-03-02', ...mon }, // 다른 회차, 2주차 월 3/9
      ],
      results: [
        { day: '2025-08-11', result: 'success' },
        { day: '2025-09-01', result: 'success' }, // 계획 없이 결과만 (8/11 기준 4주차)
        { day: '2026-03-09', result: 'broken' },
        { day: '2026-09-28', result: 'success' }, // 3/2 회차 유지기
        { day: '2026-10-01', result: 'success' }, // 지금 회차 1주차 → 빠짐
      ],
      now,
    });
    expect(current).toEqual([]);
    expect(previous).toEqual([
      {
        startDate: '2026-03-02',
        items: [item('2026-09-28', 31, 'success'), item('2026-03-09', 2, 'broken')],
      },
      {
        startDate: '2025-08-04',
        items: [
          item('2025-09-01', 4, 'success'),
          item('2025-08-18', 2),
          item('2025-08-11', 2, 'success'),
        ],
      },
    ]);
  });
});

describe('formatHistoryDay', () => {
  it('올해 날짜는 연도 없이', () => {
    expect(formatHistoryDay('2026-10-30', '2026-10-30')).toBe('10월 30일 (금)');
  });

  it('올해가 아니면 연도까지', () => {
    expect(formatHistoryDay('2025-09-01', '2026-10-30')).toBe('2025년 9월 1일 (월)');
    expect(formatHistoryDay('2025-12-31', '2026-01-01')).toBe('2025년 12월 31일 (수)');
  });
});
