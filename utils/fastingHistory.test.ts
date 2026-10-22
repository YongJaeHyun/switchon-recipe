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
        results: [{ day: '2026-10-19', result: 'broken' }],
        now: new Date('2026-10-23T09:00+09:00'),
      })
    ).toEqual([
      { day: '2026-10-22', weekIndex: 2, result: null },
      { day: '2026-10-19', weekIndex: 1, result: 'broken' },
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
});
