import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './fetchAllPages';

const source = (total: number) =>
  vi.fn(async (from: number, to: number) =>
    Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i)
  );

describe('fetchAllPages', () => {
  it('한 쪽보다 적으면 한 번만 부른다', async () => {
    const page = source(3);
    expect(await fetchAllPages(page, 1000)).toEqual([0, 1, 2]);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it('서버 최대 행 수(1000)를 넘으면 다음 쪽을 이어 받는다', async () => {
    const page = source(2500);
    const rows = await fetchAllPages(page, 1000);
    expect(rows).toHaveLength(2500);
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('딱 맞아떨어지면 빈 쪽에서 멈춘다', async () => {
    const page = source(2000);
    expect(await fetchAllPages(page, 1000)).toHaveLength(2000);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('쪽 수 상한에서 멈춘다', async () => {
    const page = source(10_000);
    expect(await fetchAllPages(page, 10, 3)).toHaveLength(30);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('실패하면 그대로 던진다', async () => {
    await expect(
      fetchAllPages(async () => {
        throw new Error('x');
      }, 10)
    ).rejects.toThrow('x');
  });
});
