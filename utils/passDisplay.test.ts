import type { SalesState } from 'types/pass';
import { describe, expect, it } from 'vitest';
import { formatPassRemaining, formatSalesHeadline } from './passDisplay';

describe('formatPassRemaining', () => {
  it('D-day 계산이 KST 기준이다', () => {
    // 만료 2026-12-01 23:59:59 KST, 지금 2026-11-19 12:00 KST
    expect(formatPassRemaining('2026-12-01T14:59:59Z', new Date('2026-11-19T03:00:00Z'))).toBe(
      'D-12 (12월 1일까지)'
    );
  });

  it('UTC로는 전날이어도 KST 날짜로 센다', () => {
    // 지금 2026-11-19 23:30 UTC = 2026-11-20 08:30 KST
    expect(formatPassRemaining('2026-12-01T14:59:59Z', new Date('2026-11-19T23:30:00Z'))).toBe(
      'D-11 (12월 1일까지)'
    );
  });

  it('만료 당일은 D-day', () => {
    expect(formatPassRemaining('2026-12-01T14:59:59Z', new Date('2026-12-01T05:00:00Z'))).toBe(
      'D-day (12월 1일까지)'
    );
  });

  it('만료 → null', () => {
    expect(
      formatPassRemaining('2026-12-01T14:59:59Z', new Date('2026-12-01T15:00:00Z'))
    ).toBeNull();
  });

  it('패스 없음 → null', () => {
    expect(formatPassRemaining(null, new Date('2026-11-19T03:00:00Z'))).toBeNull();
  });
});

const baseSales: SalesState = {
  onSale: true,
  freeActive: false,
  tier: 'regular',
  productId: 'switchon_pass_5w_4900',
  priceKrw: 4900,
  freeDaysLeft: 0,
  nextTier: null,
};

describe('formatSalesHeadline', () => {
  it('early1', () => {
    const sales: SalesState = {
      ...baseSales,
      freeActive: true,
      tier: 'early1',
      productId: 'switchon_pass_5w_1900',
      priceKrw: 1900,
      freeDaysLeft: 12,
      // 무료 기간 2026-11-01 시작 → 2주차는 2026-11-08 00:00 KST
      nextTier: { tier: 'early2', priceKrw: 2900, startsAt: '2026-11-07T15:00:00.000Z' },
    };
    expect(formatSalesHeadline(sales)).toEqual({
      price: '1,900원',
      original: '4,900원',
      badge: '61% 할인',
      next: '11월 8일부터 2,900원',
    });
  });

  it('early2', () => {
    const sales: SalesState = {
      ...baseSales,
      freeActive: true,
      tier: 'early2',
      productId: 'switchon_pass_5w_2900',
      priceKrw: 2900,
      freeDaysLeft: 3,
      nextTier: { tier: 'regular', priceKrw: 4900, startsAt: '2026-11-14T15:00:00.000Z' },
    };
    expect(formatSalesHeadline(sales)).toEqual({
      price: '2,900원',
      original: '4,900원',
      badge: '40% 할인',
      next: '11월 15일부터 4,900원',
    });
  });

  it('regular → original null', () => {
    expect(formatSalesHeadline(baseSales)).toEqual({
      price: '4,900원',
      original: null,
      badge: null,
      next: null,
    });
  });
});
