import { describe, expect, it } from 'vitest';
import {
  FASTING_START_RANGE,
  QUICK_TIMES,
  formatMinutes,
  legacyLabel,
  scheduleColumns,
  scheduleFrom,
  type FastingSchedule,
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
  it('시작 시각 범위(06:00~22:50, 10분)와 빠른 선택', () => {
    expect(FASTING_START_RANGE).toEqual({ min: 360, max: 1370, step: 10 });
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
      days: [4, 0],
      start_minutes: { '0': 1140, '4': 780 },
      start_time: '점심 식후',
    });
  });

  it('days에 없는 요일은 빼고, 비면 둘 다 null', () => {
    expect(scheduleColumns([2], { 2: 600, 5: 700 })).toEqual({
      days: [2],
      start_minutes: { '2': 600 },
      start_time: '아침 식후',
    });
    expect(scheduleColumns([], {})).toEqual({ days: [], start_minutes: null, start_time: null });
    expect(scheduleColumns([1], {})).toEqual({ days: [1], start_minutes: null, start_time: null });
  });

  // DB 트리거(clear_stale_start_minutes)는 days/start_time이 바뀌었는데 start_minutes가 같으면
  // 옛 앱 쓰기로 보고 start_minutes를 비운다. 새 앱 쓰기는 이 조건에 걸리면 안 된다
  describe('새 앱 쓰기는 트리거에 걸리지 않는다', () => {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const sameMinutes = (a: Record<string, number> | null, b: Record<string, number> | null) => {
      if (a === null || b === null) return a === b;
      const keys = Object.keys(a).sort();
      return same(keys, Object.keys(b).sort()) && keys.every((key) => a[key] === b[key]);
    };
    const trips = (
      before: ReturnType<typeof scheduleColumns>,
      after: ReturnType<typeof scheduleColumns>
    ) =>
      after.start_minutes !== null &&
      sameMinutes(before.start_minutes, after.start_minutes) &&
      (!same(before.days, after.days) || before.start_time !== after.start_time);

    it('요일 순서만 다르게 골라도 days는 월→일 순으로 같다', () => {
      const before = scheduleColumns([1, 3], { 1: 600, 3: 1200 });
      const after = scheduleColumns([3, 1], { 1: 600, 3: 1200 });
      expect(after.days).toEqual([1, 3]);
      expect(trips(before, after)).toBe(false);
    });

    it('시각이 없는 요일도 start_minutes에 읽을 때와 같은 라벨 시각으로 채운다', () => {
      const before = scheduleColumns([1, 3], { 1: 600 });
      expect(before.start_minutes).toEqual({ '1': 600, '3': 540 });
      expect(scheduleFrom(before)).toEqual({ 1: 600, 3: 540 });
      const after = scheduleColumns([1], { 1: 600 });
      expect(trips(before, after)).toBe(false);
    });

    it('여러 경우를 다 돌려도 걸리지 않는다', () => {
      const pool = [0, 1, 3, 5];
      const subsets = Array.from({ length: 1 << pool.length }, (_, mask) =>
        pool.filter((_, i) => mask & (1 << i))
      );
      const schedules: FastingSchedule[] = [{ 0: 600, 1: 600, 3: 1200, 5: 1200 }, { 1: 600 }, {}];
      const all = subsets.flatMap((days) =>
        schedules.flatMap((schedule) => [
          scheduleColumns(days, schedule),
          scheduleColumns([...days].reverse(), schedule),
        ])
      );
      for (const before of all) for (const after of all) expect(trips(before, after)).toBe(false);
    });
  });
});
