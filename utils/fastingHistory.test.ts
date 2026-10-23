import { describe, expect, it } from 'vitest';
import { fastingHistory } from './fastingHistory';

const startDate = '2026-10-15';
const week2Thu = { week_index: 2, days: [4], start_time: '저녁 식후' };

describe('fastingHistory', () => {
  it('단식이 시작된 계획일은 결과 없이 나온다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [week2Thu],
        results: [],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: null }]);
  });

  it('결과가 있으면 함께 나온다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [week2Thu],
        results: [{ day: '2026-10-22', result: 'success' }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: 'success' }]);
  });

  it('아직 시작 전인 계획일은 빠진다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [week2Thu],
        results: [],
        now: new Date('2026-10-22T18:00+09:00'),
      })
    ).toEqual([]);
  });

  it('계획에서 빠진 날의 결과도 나오고, 최근순이다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [week2Thu],
        results: [{ day: '2026-10-26', result: 'broken' }],
        now: new Date('2026-10-27T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-26', weekIndex: 2, result: 'broken' },
      { day: '2026-10-22', weekIndex: 2, result: null },
    ]);
  });

  it('시작일 이전 결과는 빠진다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [],
        results: [{ day: '2026-10-10', result: 'success' }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([]);
  });

  it('1주차(단식 없음) 날짜의 결과는 이전 프로그램 것이라 빠진다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [],
        results: [
          { day: '2026-10-21', result: 'success' },
          { day: '2026-10-22', result: 'broken' },
        ],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: 'broken' }]);
  });

  it('계획·결과가 없으면 빈 목록', () => {
    expect(
      fastingHistory({ startDate, plans: [], results: [], now: new Date('2026-10-23T09:00+09:00') })
    ).toEqual([]);
  });

  it('시작 시각이 없으면 그날 자정부터 시작으로 본다', () => {
    expect(
      fastingHistory({
        startDate,
        plans: [{ week_index: 2, days: [4], start_time: null }],
        results: [],
        now: new Date('2026-10-22T00:30+09:00'),
      })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: null }]);
  });

  it('요일별 시작 시각(start_minutes)이 라벨보다 우선한다', () => {
    const plans = [
      { week_index: 2, days: [4], start_time: '저녁 식후', start_minutes: { '4': 780 } },
    ];
    expect(
      fastingHistory({ startDate, plans, results: [], now: new Date('2026-10-22T12:59+09:00') })
    ).toEqual([]);
    expect(
      fastingHistory({ startDate, plans, results: [], now: new Date('2026-10-22T13:00+09:00') })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: null }]);
  });

  it('22:00 시작은 KST 날짜로 그날에 들어간다', () => {
    const plans = [{ week_index: 2, days: [4], start_time: null, start_minutes: { '4': 1320 } }];
    expect(
      fastingHistory({ startDate, plans, results: [], now: new Date('2026-10-22T21:59+09:00') })
    ).toEqual([]);
    // KST 목 22:00 = UTC 목 13:00
    expect(
      fastingHistory({ startDate, plans, results: [], now: new Date('2026-10-22T13:00:00Z') })
    ).toEqual([{ day: '2026-10-22', weekIndex: 2, result: null }]);
  });
});
