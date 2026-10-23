import { describe, expect, it } from 'vitest';
import { fastingDayRowLabel, sheetDaysOrdered, withNewDays } from './fastingDaySheet';

describe('fastingDayRowLabel', () => {
  it('시작 요일·시각과 다음날 끝 시각', () => {
    expect(fastingDayRowLabel(4, 1140)).toBe('목요일 · 19:00 시작 → 금 19:00 끝');
  });

  it('토요일은 일요일에 끝난다', () => {
    expect(fastingDayRowLabel(6, 1320)).toBe('토요일 · 22:00 시작 → 일 22:00 끝');
  });

  it('30분 시각', () => {
    expect(fastingDayRowLabel(0, 810)).toBe('일요일 · 13:30 시작 → 월 13:30 끝');
  });
});

describe('sheetDaysOrdered', () => {
  it('월→일 순서', () => {
    expect(sheetDaysOrdered([0, 4, 1])).toEqual([1, 4, 0]);
  });
});

describe('withNewDays', () => {
  it('새 요일은 직전에 정한 시각으로 채운다', () => {
    expect(withNewDays({ 1: 780 }, [1, 4], 810)).toEqual({ 1: 780, 4: 810 });
  });

  it('직전에 정한 시각이 없으면 19:00', () => {
    expect(withNewDays({}, [3], undefined)).toEqual({ 3: 1140 });
  });

  it('이미 시각이 있는 요일은 그대로, 빠진 요일은 지운다', () => {
    expect(withNewDays({ 1: 780, 3: 540 }, [3, 5], undefined)).toEqual({ 3: 540, 5: 1140 });
  });
});
