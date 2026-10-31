import { describe, expect, it } from 'vitest';
import { buildTodoRateWeeks, isDayReached, shiftStatistics } from './todoRateWeeks';

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

// 주차 맞추기: 할 일 통계 행 (주차, 일차)는 그때 시작일 기준이라, 시작일이 delta일 앞당겨지면(+) 같은 날짜가 delta일 뒤 칸이 된다
describe('shiftStatistics (주차 맞추기 뒤 같은 날짜 칸으로)', () => {
  const row = (week: number, day: number, todo_rate = 100) => ({ week, day, todo_rate });

  it('2주차 → 4주차 (14일 앞당김): 1·2주차 기록이 3·4주차 칸으로, 오늘(자르는 칸)부터는 뺀다', () => {
    const rows = [row(1, 1), row(1, 7, 50), row(2, 2, 80), row(2, 3, 20)];
    // 오늘 = 예전 2주차 3일 = 새 4주차 3일
    expect(shiftStatistics(rows, 14, { week: 4, day: 3 })).toEqual([
      row(3, 1),
      row(3, 7, 50),
      row(4, 2, 80),
    ]);
  });

  it('2주차 5일 → 4주차 1일 (9일 앞당김): 일 단위로 옮긴다', () => {
    expect(shiftStatistics([row(1, 1), row(2, 4)], 9, { week: 4, day: 1 })).toEqual([
      row(2, 3),
      row(3, 6),
    ]);
  });

  it('4주차 → 2주차 (14일 미룸): 새 시작일 전 기록은 빼고 나머지는 앞 칸으로', () => {
    const rows = [row(1, 1), row(2, 7), row(3, 1, 70), row(4, 2, 30)];
    expect(shiftStatistics(rows, -14, { week: 2, day: 3 })).toEqual([row(1, 1, 70), row(2, 2, 30)]);
  });

  it('주차·일차가 없는 행은 뺀다', () => {
    expect(
      shiftStatistics([{ week: null, day: 1, todo_rate: 10 }, row(1, 1)], 0, { week: 2, day: 1 })
    ).toEqual([row(1, 1)]);
  });
});
