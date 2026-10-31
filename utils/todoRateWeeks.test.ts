import { describe, expect, it } from 'vitest';
import { buildTodoRateWeeks, isDayReached } from './todoRateWeeks';

describe('isDayReached', () => {
  it('오늘까지 지난 날만 도달', () => {
    const progress = { week: 2, day: 3, beforeStart: false };
    expect(isDayReached(1, 7, progress)).toBe(true);
    expect(isDayReached(2, 3, progress)).toBe(true);
    expect(isDayReached(2, 4, progress)).toBe(false);
    expect(isDayReached(3, 1, progress)).toBe(false);
  });

  it('시작 전이면 1주차 1일도 도달하지 않은 것으로 본다', () => {
    const progress = { week: 1, day: 1, beforeStart: true };
    expect(isDayReached(1, 1, progress)).toBe(false);
  });
});

describe('buildTodoRateWeeks', () => {
  it('도달한 날은 기록(없으면 0), 아직 안 온 날은 null, 평균은 도달한 날만', () => {
    const weeks = buildTodoRateWeeks(
      [
        { week: 1, day: 1, todo_rate: 100 },
        { week: 1, day: 2, todo_rate: 50 },
      ],
      { week: 1, day: 3, beforeStart: false }
    );
    expect(weeks).toHaveLength(4);
    expect(weeks[0].todoRatesByWeek).toEqual([100, 50, 0, null, null, null, null]);
    expect(weeks[0].average).toBe(50);
    expect(weeks[1].todoRatesByWeek).toEqual(Array(7).fill(null));
    expect(weeks[1].average).toBe(0);
  });

  it('시작 전이면 모든 날이 null (1일 막대 0%가 생기지 않는다)', () => {
    const weeks = buildTodoRateWeeks([], { week: 1, day: 1, beforeStart: true });
    for (const w of weeks) {
      expect(w.todoRatesByWeek).toEqual(Array(7).fill(null));
      expect(w.average).toBe(0);
    }
  });
});
