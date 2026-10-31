import { describe, expect, it, vi } from 'vitest';
import { realignStatistics, type RealignDeps } from './statisticsRealign';

type Row = { id: number; week: number; day: number; todo_rate: number };

// 메모리 속 statistics 표. (week, day)가 키 (DB의 uid,week,day 유니크와 같다)
const fakeTable = (rows: Row[], fail: Partial<Record<keyof RealignDeps, boolean>> = {}) => {
  let table = rows.map((r) => ({ ...r }));
  let nextId = 100;
  const deps: RealignDeps = {
    select: vi.fn(async () => {
      if (fail.select) throw new Error('select');
      return table.map(({ week, day, todo_rate }) => ({ week, day, todo_rate }));
    }),
    upsert: vi.fn(async (shifted: Omit<Row, 'id'>[]) => {
      if (fail.upsert) throw new Error('upsert');
      return shifted.map((s) => {
        const hit = table.find((r) => r.week === s.week && r.day === s.day);
        if (hit) {
          hit.todo_rate = s.todo_rate;
          return hit.id;
        }
        const id = nextId++;
        table.push({ id, ...s });
        return id;
      });
    }),
    deleteExcept: vi.fn(async (ids: number[]) => {
      if (fail.deleteExcept) throw new Error('deleteExcept');
      table = table.filter((r) => ids.includes(r.id));
    }),
    deleteFrom: vi.fn(async (week: number, day: number) => {
      if (fail.deleteFrom) throw new Error('deleteFrom');
      table = table.filter((r) => r.week < week || (r.week === week && r.day < day));
    }),
  };
  const cells = () => table.map(({ week, day, todo_rate }) => `${week}-${day}:${todo_rate}`).sort();
  return { deps, cells };
};

// 2주차 3일 → 4주차 3일 (14일 앞당김). 오늘 칸 = 4주차 3일
const rows: Row[] = [
  { id: 1, week: 1, day: 1, todo_rate: 100 },
  { id: 2, week: 2, day: 2, todo_rate: 80 },
  { id: 3, week: 2, day: 3, todo_rate: 20 }, // 오늘 (새로 쌓는다)
];
const cut = { week: 4, day: 3 };

describe('realignStatistics (먼저 쓰고 나중에 지운다)', () => {
  it('옮긴 행을 쓰고, 나머지(옛 칸·오늘 칸)를 지운다', async () => {
    const { deps, cells } = fakeTable(rows);
    expect(await realignStatistics(deps, 14, cut)).toBe('realigned');
    expect(cells()).toEqual(['3-1:100', '4-2:80']);
    expect(deps.deleteFrom).not.toHaveBeenCalled();
  });

  it('쓰기가 실패하면 아무것도 지우지 않고 예전처럼 오늘 칸부터만 지운다 (기록을 잃지 않음)', async () => {
    const { deps, cells } = fakeTable(rows, { upsert: true });
    expect(await realignStatistics(deps, 14, cut)).toBe('fallback');
    expect(deps.deleteExcept).not.toHaveBeenCalled();
    expect(deps.deleteFrom).toHaveBeenCalledWith(4, 3);
    expect(cells()).toEqual(['1-1:100', '2-2:80', '2-3:20']);
  });

  it('읽기가 실패해도 예전처럼 오늘 칸부터만 지운다', async () => {
    const { deps, cells } = fakeTable(rows, { select: true });
    expect(await realignStatistics(deps, 14, cut)).toBe('fallback');
    expect(deps.upsert).not.toHaveBeenCalled();
    expect(cells()).toEqual(['1-1:100', '2-2:80', '2-3:20']);
  });

  it('남은 행 지우기가 실패하면 옮긴 행과 옛 칸이 함께 남는다 (잃지 않음, 예전 표시 문제만)', async () => {
    const { deps, cells } = fakeTable(rows, { deleteExcept: true });
    expect(await realignStatistics(deps, 14, cut)).toBe('partial');
    expect(cells()).toEqual(['1-1:100', '2-2:80', '2-3:20', '3-1:100', '4-2:80']);
  });

  it('옮길 행이 없으면 모두 지운다 (오늘 칸만 있던 경우 등)', async () => {
    const { deps, cells } = fakeTable([{ id: 9, week: 1, day: 1, todo_rate: 50 }]);
    expect(await realignStatistics(deps, 0, { week: 1, day: 1 })).toBe('realigned');
    expect(deps.upsert).not.toHaveBeenCalled();
    expect(cells()).toEqual([]);
  });

  it('겹치는 칸도 옮긴 값으로 덮는다 (7일 앞당김: 1주차 → 2주차 칸)', async () => {
    const { deps, cells } = fakeTable([
      { id: 1, week: 1, day: 1, todo_rate: 10 },
      { id: 2, week: 2, day: 1, todo_rate: 20 },
    ]);
    expect(await realignStatistics(deps, 7, { week: 4, day: 1 })).toBe('realigned');
    expect(cells()).toEqual(['2-1:10', '3-1:20']);
  });
});
