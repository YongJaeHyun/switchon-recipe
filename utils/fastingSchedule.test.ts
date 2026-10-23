import { describe, expect, it } from 'vitest';
import {
  FASTING_SLIDER,
  QUICK_TIMES,
  formatMinutes,
  legacyLabel,
  scheduleColumns,
  scheduleFrom,
} from './fastingSchedule';

describe('scheduleFrom', () => {
  it('start_minutes가 있으면 그것을 쓴다', () => {
    expect(
      scheduleFrom({
        days: [4, 6],
        start_time: '저녁 식후',
        start_minutes: { '4': 780, '6': 1140 },
      })
    ).toEqual({ 4: 780, 6: 1140 });
  });

  it('start_minutes가 없으면 라벨 시각을 모든 요일에 채운다', () => {
    expect(scheduleFrom({ days: [1, 3], start_time: '점심 식후' })).toEqual({ 1: 780, 3: 780 });
    expect(scheduleFrom({ days: [2], start_time: '아침 식후', start_minutes: null })).toEqual({
      2: 540,
    });
  });

  it('둘 다 없으면 빈 지도', () => {
    expect(scheduleFrom({ days: [1, 3], start_time: null, start_minutes: null })).toEqual({});
    expect(scheduleFrom({ days: null, start_time: null })).toEqual({});
  });

  it('start_minutes에 없는 요일은 라벨로 채운다', () => {
    expect(
      scheduleFrom({ days: [1, 3], start_time: '저녁 식후', start_minutes: { '1': 600 } })
    ).toEqual({ 1: 600, 3: 1140 });
  });

  it('days에 없는 요일 값은 버린다', () => {
    expect(
      scheduleFrom({ days: [1], start_time: null, start_minutes: { '1': 600, '5': 700 } })
    ).toEqual({ 1: 600 });
  });

  it('잘못된 jsonb 값은 무시한다', () => {
    const row = { days: [1, 3], start_time: '저녁 식후' };
    const label = { 1: 1140, 3: 1140 };
    expect(scheduleFrom({ ...row, start_minutes: 'oops' })).toEqual(label);
    expect(scheduleFrom({ ...row, start_minutes: [600, 700] })).toEqual(label);
    expect(scheduleFrom({ ...row, start_minutes: 42 })).toEqual(label);
    expect(scheduleFrom({ ...row, start_minutes: { '1': '600', '3': 1440, x: 600 } })).toEqual(
      label
    );
    expect(scheduleFrom({ ...row, start_minutes: { '1': -30, '3': 12.5 } })).toEqual(label);
    expect(scheduleFrom({ days: [1], start_time: '모름', start_minutes: { '1': NaN } })).toEqual(
      {}
    );
  });
});

describe('legacyLabel', () => {
  it('가장 가까운 라벨', () => {
    expect(legacyLabel(360)).toBe('아침 식후');
    expect(legacyLabel(540)).toBe('아침 식후');
    expect(legacyLabel(780)).toBe('점심 식후');
    expect(legacyLabel(1140)).toBe('저녁 식후');
    expect(legacyLabel(1320)).toBe('저녁 식후');
  });

  it('경계 660(아침·점심 가운데)과 960(점심·저녁 가운데)은 뒤 라벨', () => {
    expect(legacyLabel(659)).toBe('아침 식후');
    expect(legacyLabel(660)).toBe('점심 식후');
    expect(legacyLabel(959)).toBe('점심 식후');
    expect(legacyLabel(960)).toBe('저녁 식후');
  });
});

describe('formatMinutes', () => {
  it('HH:mm', () => {
    expect(formatMinutes(1140)).toBe('19:00');
    expect(formatMinutes(1170)).toBe('19:30');
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(360)).toBe('06:00');
    expect(formatMinutes(0)).toBe('00:00');
  });
});

describe('상수', () => {
  it('슬라이더 범위와 빠른 선택', () => {
    expect(FASTING_SLIDER).toEqual({ min: 360, max: 1320, step: 30 });
    expect(QUICK_TIMES).toEqual([
      { label: '아침 식후', minutes: 540 },
      { label: '점심 식후', minutes: 780 },
      { label: '저녁 식후', minutes: 1140 },
    ]);
  });
});

describe('scheduleColumns', () => {
  it('start_minutes와 첫 요일(월→일 순) 시각의 라벨을 함께 만든다', () => {
    expect(scheduleColumns([0, 4], { 0: 1140, 4: 780 })).toEqual({
      start_minutes: { '0': 1140, '4': 780 },
      start_time: '점심 식후',
    });
  });

  it('days에 없는 요일은 빼고, 비면 둘 다 null', () => {
    expect(scheduleColumns([2], { 2: 600, 5: 700 })).toEqual({
      start_minutes: { '2': 600 },
      start_time: '아침 식후',
    });
    expect(scheduleColumns([], {})).toEqual({ start_minutes: null, start_time: null });
    expect(scheduleColumns([1], {})).toEqual({ start_minutes: null, start_time: null });
  });
});
