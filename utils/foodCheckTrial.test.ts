import { describe, expect, it } from 'vitest';
import type { PassStatus } from 'types/pass';
import {
  foodCheckEntryState,
  formatFoodCheckTrial,
  getFoodCheckTrialRemaining,
} from './foodCheckTrial';

const status = (o: Partial<PassStatus> = {}, onSale = true): PassStatus => ({
  sales: {
    onSale,
    freeActive: false,
    tier: onSale ? 'regular' : null,
    productId: onSale ? 'switchon_pass_5w_4900' : null,
    priceKrw: onSale ? 4900 : null,
    freeDaysLeft: 0,
    nextTier: null,
  },
  passExpiresAt: null,
  hasAccess: false,
  serverNow: '2026-10-31T00:00:00Z',
  ...o,
});

describe('getFoodCheckTrialRemaining', () => {
  it('상태를 모르면 0', () => {
    expect(getFoodCheckTrialRemaining(undefined)).toBe(0);
  });

  it('필드를 모르는 옛 서버면 0', () => {
    expect(getFoodCheckTrialRemaining(status())).toBe(0);
  });

  it('패스가 있으면 무료 체험을 보이지 않는다 (0)', () => {
    expect(
      getFoodCheckTrialRemaining(status({ hasAccess: true, foodCheckTrialRemaining: 3 }))
    ).toBe(0);
  });

  it('패스가 없으면 서버 값', () => {
    expect(getFoodCheckTrialRemaining(status({ foodCheckTrialRemaining: 2 }))).toBe(2);
  });

  it('이상한 값은 0', () => {
    expect(getFoodCheckTrialRemaining(status({ foodCheckTrialRemaining: -1 }))).toBe(0);
    expect(getFoodCheckTrialRemaining(status({ foodCheckTrialRemaining: Number.NaN }))).toBe(0);
  });
});

describe('foodCheckEntryState', () => {
  it('상태를 모르면 숨긴다', () => {
    expect(foodCheckEntryState(undefined, true)).toEqual({ kind: 'hidden' });
  });

  it('패스가 있으면 열림', () => {
    expect(foodCheckEntryState(status({ hasAccess: true }), true)).toEqual({ kind: 'open' });
  });

  it('무료 체험이 남았으면 체험 (판매 중이 아니어도)', () => {
    expect(foodCheckEntryState(status({ foodCheckTrialRemaining: 3 }), true)).toEqual({
      kind: 'trial',
      remaining: 3,
    });
    expect(foodCheckEntryState(status({ foodCheckTrialRemaining: 1 }, false), false)).toEqual({
      kind: 'trial',
      remaining: 1,
    });
  });

  it('무료 체험을 다 썼고 패스를 살 수 있으면 잠금 (누르면 패스 안내)', () => {
    expect(foodCheckEntryState(status({ foodCheckTrialRemaining: 0 }), true)).toEqual({
      kind: 'locked',
    });
  });

  it('무료 체험을 다 썼고 패스를 살 수 없으면 숨긴다', () => {
    expect(foodCheckEntryState(status({ foodCheckTrialRemaining: 0 }, false), true)).toEqual({
      kind: 'hidden',
    });
    expect(foodCheckEntryState(status({ foodCheckTrialRemaining: 0 }), false)).toEqual({
      kind: 'hidden',
    });
  });
});

describe('formatFoodCheckTrial', () => {
  it('남은 횟수 문구', () => {
    expect(formatFoodCheckTrial(3)).toBe('무료 체험 3번 남았어요');
    expect(formatFoodCheckTrial(1)).toBe('무료 체험 1번 남았어요');
  });

  it('다 쓰면 다 썼다는 문구', () => {
    expect(formatFoodCheckTrial(0)).toBe('무료 체험 3번을 모두 썼어요');
  });
});
