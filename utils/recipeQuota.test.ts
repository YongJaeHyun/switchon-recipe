import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatRemaining,
  getQuotaModalActions,
  runAdBonusFlow,
  waitForAdBonus,
} from './recipeQuota';

describe('getQuotaModalActions', () => {
  const base = { isPass: false, canWatchAd: true, onSale: true, adsAvailable: true };

  it('패스 이용자는 아무 동작도 없다', () => {
    expect(getQuotaModalActions({ ...base, isPass: true })).toEqual([]);
  });
  it('무료 + 광고 가능 + 판매중 → 광고, 패스', () => {
    expect(getQuotaModalActions(base)).toEqual(['watchAd', 'pass']);
  });
  it('광고 소진 → 패스만', () => {
    expect(getQuotaModalActions({ ...base, canWatchAd: false })).toEqual(['pass']);
  });
  it('광고 모듈 없음 → watchAd 제외', () => {
    expect(getQuotaModalActions({ ...base, adsAvailable: false })).toEqual(['pass']);
  });
  it('판매 안 함 → pass 제외', () => {
    expect(getQuotaModalActions({ ...base, onSale: false })).toEqual(['watchAd']);
  });
});

describe('formatRemaining', () => {
  it('무료 3 → 오늘 3개 남았어요', () => {
    expect(formatRemaining({ isPass: false, remaining: 3 })).toBe('오늘 3개 남았어요');
  });
  it('패스 12 → null', () => {
    expect(formatRemaining({ isPass: true, remaining: 12 })).toBeNull();
  });
  it('패스 4 → 오늘 4개 남았어요', () => {
    expect(formatRemaining({ isPass: true, remaining: 4 })).toBe('오늘 4개 남았어요');
  });
});

describe('waitForAdBonus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('3번째 조회에서 반영되면 true', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ remaining: 0 })
      .mockResolvedValueOnce({ remaining: 0 })
      .mockResolvedValueOnce({ remaining: 1 });
    const promise = waitForAdBonus(get, { tries: 5, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBe(true);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('끝까지 0이면 false', async () => {
    const get = vi.fn().mockResolvedValue({ remaining: 0 });
    const promise = waitForAdBonus(get, { tries: 3, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBe(false);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
