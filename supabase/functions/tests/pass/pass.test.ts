import { describe, expect, it } from 'vitest';
import {
  computeExpiry,
  GRACE_MS,
  getSalesState,
  isFreeActive,
  isPurchaseEligible,
  PASS_DAYS,
  PASS_EXTENSION_DAYS,
  PASS_PRODUCTS,
  passProductOf,
  tierOfProduct,
  WEEK_PASS_PRODUCT,
  type PremiumSetting,
  type PurchaseForExpiry,
} from '../../_shared/pass.ts';

const DAY = 24 * 60 * 60 * 1000;

const setting: PremiumSetting = { freeStart: '2026-11-01', freeEnd: '2026-11-14' };
const noSetting: PremiumSetting = { freeStart: null, freeEnd: null };

describe('PASS_PRODUCTS', () => {
  it('maps each tier to its product id and price', () => {
    expect(PASS_PRODUCTS).toEqual({
      early1: { productId: 'switchon_pass_5w_1900', priceKrw: 1900 },
      early2: { productId: 'switchon_pass_5w_2900', priceKrw: 2900 },
      regular: { productId: 'switchon_pass_5w_4900', priceKrw: 4900 },
    });
  });
});

describe('1주 패스 상품', () => {
  it('switchon_pass_1w_1500: 7일, 1,500원 고정', () => {
    expect(WEEK_PASS_PRODUCT).toEqual({
      productId: 'switchon_pass_1w_1500',
      priceKrw: 1500,
      days: 7,
    });
  });

  it('passProductOf: 상품별 가격·일수 (5주 35일, 1주 7일), 모르는 상품은 null', () => {
    expect(passProductOf('switchon_pass_5w_1900')).toEqual({ priceKrw: 1900, days: 35 });
    expect(passProductOf('switchon_pass_5w_2900')).toEqual({ priceKrw: 2900, days: 35 });
    expect(passProductOf('switchon_pass_5w_4900')).toEqual({ priceKrw: 4900, days: 35 });
    expect(passProductOf('switchon_pass_1w_1500')).toEqual({ priceKrw: 1500, days: 7 });
    expect(passProductOf('x')).toBeNull();
  });

  it('1주 패스는 가격 구간이 없다 (tierOfProduct null)', () => {
    expect(tierOfProduct('switchon_pass_1w_1500')).toBeNull();
  });

  it('판매 중이면 sales.weekPass로 함께 내려주고, 가격은 구간과 무관하게 1,500원', () => {
    for (const at of ['2026-10-31T15:00:00Z', '2026-11-07T15:00:00Z', '2026-11-14T15:00:00Z']) {
      expect(getSalesState(new Date(at), setting).weekPass).toEqual(WEEK_PASS_PRODUCT);
    }
  });

  it('판매 전(설정 없음, 무료 기간 시작 전)에는 weekPass도 null', () => {
    expect(getSalesState(new Date('2026-11-01T00:00:00Z'), noSetting).weekPass).toBeNull();
    expect(getSalesState(new Date('2026-10-31T14:59:59Z'), setting).weekPass).toBeNull();
  });

  it('isPurchaseEligible: 1주 패스는 언제 사도 유효 (고정 가격, 설정 null 포함)', () => {
    expect(
      isPurchaseEligible('switchon_pass_1w_1500', new Date('2026-01-01T00:00:00Z'), setting)
    ).toBe(true);
    expect(
      isPurchaseEligible('switchon_pass_1w_1500', new Date('2026-11-03T00:00:00Z'), noSetting)
    ).toBe(true);
  });
});

describe('getSalesState', () => {
  it('설정 없음: 판매하지 않음', () => {
    const state = getSalesState(new Date('2026-11-01T00:00:00Z'), noSetting);
    expect(state.onSale).toBe(false);
    expect(state.tier).toBeNull();
    expect(state.freeActive).toBe(false);
    expect(state.productId).toBeNull();
    expect(state.priceKrw).toBeNull();
    expect(state.freeDaysLeft).toBe(0);
    expect(state.nextTier).toBeNull();
  });

  it('시작 전: 11/1 00:00 KST 1초 전 — 판매하지 않음 (운영자 결정)', () => {
    const state = getSalesState(new Date('2026-10-31T14:59:59Z'), setting);
    expect(state).toMatchObject({
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
    });
    expect(state.nextTier).toMatchObject({ tier: 'early1', startsAt: '2026-10-31T15:00:00.000Z' });
  });

  it('1일째 시작: 11/1 00:00 KST', () => {
    const state = getSalesState(new Date('2026-10-31T15:00:00Z'), setting);
    expect(state.tier).toBe('early1');
    expect(state.freeActive).toBe(true);
    expect(state.freeDaysLeft).toBe(14);
    expect(state.nextTier).toEqual({
      tier: 'early2',
      priceKrw: 2900,
      startsAt: '2026-11-07T15:00:00.000Z',
    });
  });

  it('7일째 끝', () => {
    const state = getSalesState(new Date('2026-11-07T14:59:59Z'), setting);
    expect(state.tier).toBe('early1');
    expect(state.freeDaysLeft).toBe(8);
  });

  it('8일째 시작', () => {
    const state = getSalesState(new Date('2026-11-07T15:00:00Z'), setting);
    expect(state.tier).toBe('early2');
    expect(state.priceKrw).toBe(2900);
    expect(state.freeDaysLeft).toBe(7);
  });

  it('14일째 끝', () => {
    const state = getSalesState(new Date('2026-11-14T14:59:59Z'), setting);
    expect(state.tier).toBe('early2');
    expect(state.freeActive).toBe(true);
    expect(state.freeDaysLeft).toBe(1);
  });

  it('15일째', () => {
    const state = getSalesState(new Date('2026-11-14T15:00:00Z'), setting);
    expect(state.tier).toBe('regular');
    expect(state.freeActive).toBe(false);
    expect(state.freeDaysLeft).toBe(0);
    expect(state.nextTier).toBeNull();
  });
});

describe('isFreeActive', () => {
  it('matches getSalesState.freeActive across boundaries', () => {
    expect(isFreeActive(new Date('2026-10-31T14:59:59Z'), setting)).toBe(false);
    expect(isFreeActive(new Date('2026-10-31T15:00:00Z'), setting)).toBe(true);
    expect(isFreeActive(new Date('2026-11-14T14:59:59Z'), setting)).toBe(true);
    expect(isFreeActive(new Date('2026-11-14T15:00:00Z'), setting)).toBe(false);
  });

  it('설정 없음이면 항상 false', () => {
    expect(isFreeActive(new Date('2026-11-05T00:00:00Z'), noSetting)).toBe(false);
  });
});

describe('tierOfProduct', () => {
  it('resolves known product ids', () => {
    expect(tierOfProduct('switchon_pass_5w_1900')).toBe('early1');
    expect(tierOfProduct('switchon_pass_5w_2900')).toBe('early2');
    expect(tierOfProduct('switchon_pass_5w_4900')).toBe('regular');
  });

  it('returns null for unknown product ids', () => {
    expect(tierOfProduct('x')).toBeNull();
  });
});

describe('isPurchaseEligible', () => {
  it('같은 구간: 1900 at 11/3', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_1900', new Date('2026-11-03T00:00:00Z'), setting)
    ).toBe(true);
  });

  it('유예 안: 1900 at 구간 종료 후 24h 직전', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_1900', new Date('2026-11-08T14:59:59Z'), setting)
    ).toBe(true);
  });

  it('유예 밖: 1900 at 구간 종료 후 정확히 24h', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_1900', new Date('2026-11-08T15:00:00Z'), setting)
    ).toBe(false);
  });

  it('미래 구간: 2900 at 11/2', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-11-02T00:00:00Z'), setting)
    ).toBe(false);
  });

  it('정가: 4900 아무 때나, 설정 null 포함', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_4900', new Date('2026-01-01T00:00:00Z'), setting)
    ).toBe(true);
    expect(
      isPurchaseEligible('switchon_pass_5w_4900', new Date('2026-01-01T00:00:00Z'), noSetting)
    ).toBe(true);
  });

  it('모르는 상품', () => {
    expect(isPurchaseEligible('x', new Date('2026-11-03T00:00:00Z'), setting)).toBe(false);
  });
});

describe('computeExpiry', () => {
  const purchase = (
    purchasedAt: string,
    status: PurchaseForExpiry['status'] = 'granted',
    productId = 'switchon_pass_5w_4900'
  ): PurchaseForExpiry => ({ productId, purchasedAt: new Date(purchasedAt), status });

  it('없음: 빈 배열', () => {
    expect(computeExpiry([])).toBeNull();
  });

  it('없음: 전부 voided', () => {
    expect(
      computeExpiry([
        purchase('2026-11-01T10:00:00Z', 'voided'),
        purchase('2026-11-10T10:00:00Z', 'refunded_ineligible'),
      ])
    ).toBeNull();
  });

  it('단일: 11/1 10:00Z + 35일', () => {
    const expected = new Date('2026-11-01T10:00:00Z').getTime() + PASS_DAYS * 24 * 60 * 60 * 1000;
    expect(computeExpiry([purchase('2026-11-01T10:00:00Z')])?.getTime()).toBe(expected);
  });

  it('겹침: 11/1, 11/10 → 11/1 + 70일', () => {
    const expected =
      new Date('2026-11-01T10:00:00Z').getTime() + 2 * PASS_DAYS * 24 * 60 * 60 * 1000;
    expect(
      computeExpiry([purchase('2026-11-01T10:00:00Z'), purchase('2026-11-10T10:00:00Z')])?.getTime()
    ).toBe(expected);
  });

  it('만료 후 재구매: 11/1, 12/20 → 12/20 + 35일', () => {
    const expected = new Date('2026-12-20T10:00:00Z').getTime() + PASS_DAYS * 24 * 60 * 60 * 1000;
    expect(
      computeExpiry([purchase('2026-11-01T10:00:00Z'), purchase('2026-12-20T10:00:00Z')])?.getTime()
    ).toBe(expected);
  });

  it('겹친 것 중 앞 것 환불: 11/1 voided, 11/10 granted → 11/10 + 35일', () => {
    const expected = new Date('2026-11-10T10:00:00Z').getTime() + PASS_DAYS * 24 * 60 * 60 * 1000;
    expect(
      computeExpiry([
        purchase('2026-11-01T10:00:00Z', 'voided'),
        purchase('2026-11-10T10:00:00Z'),
      ])?.getTime()
    ).toBe(expected);
  });

  it('순서 무관: 입력 순서를 섞어도 같은 결과', () => {
    const ordered = computeExpiry([
      purchase('2026-11-01T10:00:00Z'),
      purchase('2026-11-10T10:00:00Z'),
      purchase('2026-12-20T10:00:00Z'),
    ]);
    const shuffled = computeExpiry([
      purchase('2026-12-20T10:00:00Z'),
      purchase('2026-11-01T10:00:00Z'),
      purchase('2026-11-10T10:00:00Z'),
    ]);
    expect(shuffled?.getTime()).toBe(ordered?.getTime());
  });
});

describe('computeExpiry: 상품별 일수', () => {
  const purchase = (
    purchasedAt: string,
    productId: string,
    status: PurchaseForExpiry['status'] = 'granted'
  ): PurchaseForExpiry => ({ productId, purchasedAt: new Date(purchasedAt), status });
  const at = (iso: string) => new Date(iso).getTime();

  it('1주 패스 단독: +7일', () => {
    expect(
      computeExpiry([purchase('2026-11-01T10:00:00Z', 'switchon_pass_1w_1500')])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 7 * DAY);
  });

  it('5주 패스 중 1주 패스: 만료일 뒤에 7일을 이어 붙인다', () => {
    expect(
      computeExpiry([
        purchase('2026-11-01T10:00:00Z', 'switchon_pass_5w_4900'),
        purchase('2026-11-10T10:00:00Z', 'switchon_pass_1w_1500'),
      ])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 42 * DAY);
  });

  it('1주 패스 중 5주 패스: 7일 뒤에 35일', () => {
    expect(
      computeExpiry([
        purchase('2026-11-01T10:00:00Z', 'switchon_pass_1w_1500'),
        purchase('2026-11-03T10:00:00Z', 'switchon_pass_5w_1900'),
      ])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 42 * DAY);
  });

  it('1주 패스 환불: 그 7일만 빠진다', () => {
    expect(
      computeExpiry([
        purchase('2026-11-01T10:00:00Z', 'switchon_pass_5w_4900'),
        purchase('2026-11-10T10:00:00Z', 'switchon_pass_1w_1500', 'voided'),
      ])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 35 * DAY);
  });
});

describe('computeExpiry: 한 주 더 하기 연장', () => {
  const p = (purchasedAt: string, status: PurchaseForExpiry['status'] = 'granted') => ({
    productId: 'switchon_pass_5w_4900',
    purchasedAt: new Date(purchasedAt),
    status,
  });
  const ext = (extendedAt: string) => ({ extendedAt: new Date(extendedAt) });
  const at = (iso: string) => new Date(iso).getTime();

  it('PASS_EXTENSION_DAYS는 7일', () => {
    expect(PASS_EXTENSION_DAYS).toBe(7);
  });

  it('패스 기간 중 연장: 만료일 +7일', () => {
    expect(
      computeExpiry([p('2026-11-01T10:00:00Z')], [ext('2026-11-20T00:00:00Z')])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 42 * DAY);
  });

  it('연장 뒤 새 구매: 연장된 만료일 뒤에 이어 붙인다 (연장분이 사라지지 않음)', () => {
    expect(
      computeExpiry(
        [p('2026-11-01T10:00:00Z'), p('2026-11-25T10:00:00Z')],
        [ext('2026-11-20T00:00:00Z')]
      )?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 77 * DAY);
  });

  it('연장 시각에 패스가 끝나 있었으면(환불로 앞 구매가 빠짐 등) 연장은 반영하지 않는다', () => {
    expect(
      computeExpiry([p('2026-11-01T10:00:00Z')], [ext('2026-12-20T00:00:00Z')])?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 35 * DAY);
    expect(
      computeExpiry([p('2026-11-01T10:00:00Z', 'voided')], [ext('2026-11-20T00:00:00Z')])
    ).toBeNull();
  });

  it('연장 후 구매가 환불돼도 남은 구매 기간 안의 연장은 유지', () => {
    expect(
      computeExpiry(
        [p('2026-11-01T10:00:00Z'), p('2026-11-10T10:00:00Z', 'voided')],
        [ext('2026-11-20T00:00:00Z'), ext('2026-11-27T00:00:00Z')]
      )?.getTime()
    ).toBe(at('2026-11-01T10:00:00Z') + 49 * DAY);
  });

  it('연장만 있고 구매가 없으면 null', () => {
    expect(computeExpiry([], [ext('2026-11-20T00:00:00Z')])).toBeNull();
  });
});

describe('GRACE_MS', () => {
  it('is 24 hours in ms', () => {
    expect(GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
