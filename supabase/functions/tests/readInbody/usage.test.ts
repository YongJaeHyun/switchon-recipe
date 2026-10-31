import { describe, expect, it, vi } from 'vitest';
import { consumeDailyUsage, releaseDailyUsage, type UsageStore } from '../../read-inbody/usage.ts';

// premium_usage 행 하나를 흉내 낸다. swap은 used가 from일 때만 바꾼다 (update ... where used = from)
const fakeStore = (initial: number | null) => {
  let used = initial;
  const store: UsageStore & { value: () => number | null } = {
    ensure: vi.fn(async () => {
      if (used === null) used = 0;
    }),
    read: vi.fn(async () => used),
    swap: vi.fn(async (from: number, to: number) => {
      if (used !== from) return false;
      used = to;
      return true;
    }),
    value: () => used,
  };
  return store;
};

describe('consumeDailyUsage', () => {
  it('행이 없으면 만들고 1 차감', async () => {
    const store = fakeStore(null);
    expect(await consumeDailyUsage(store, 10)).toEqual({ allowed: true, remaining: 9, limit: 10 });
    expect(store.value()).toBe(1);
  });

  it('마지막 1회까지 허용, 한도에 닿으면 거절하고 바꾸지 않음', async () => {
    const store = fakeStore(9);
    expect(await consumeDailyUsage(store, 10)).toEqual({ allowed: true, remaining: 0, limit: 10 });
    expect(await consumeDailyUsage(store, 10)).toEqual({ allowed: false, remaining: 0, limit: 10 });
    expect(store.value()).toBe(10);
  });

  it('동시에 다른 요청이 먼저 바꾸면 다시 읽어 차감한다', async () => {
    const store = fakeStore(3);
    let first = true;
    const swap = store.swap;
    store.swap = vi.fn(async (from: number, to: number) => {
      if (first) {
        first = false;
        await swap(3, 4); // 다른 요청이 끼어듦
        return false;
      }
      return swap(from, to);
    });
    expect(await consumeDailyUsage(store, 10)).toEqual({ allowed: true, remaining: 5, limit: 10 });
    expect(store.value()).toBe(5);
  });

  it('계속 경합에 지면 던진다 (500)', async () => {
    const store = fakeStore(0);
    store.swap = vi.fn(async () => false);
    await expect(consumeDailyUsage(store, 10)).rejects.toThrow();
  });
});

describe('releaseDailyUsage', () => {
  it('1 되돌린다', async () => {
    const store = fakeStore(4);
    await releaseDailyUsage(store);
    expect(store.value()).toBe(3);
  });

  it('0이거나 행이 없으면 그대로', async () => {
    const zero = fakeStore(0);
    await releaseDailyUsage(zero);
    expect(zero.value()).toBe(0);
    expect(zero.swap).not.toHaveBeenCalled();
    const none = fakeStore(null);
    await releaseDailyUsage(none);
    expect(none.value()).toBeNull();
  });
});
