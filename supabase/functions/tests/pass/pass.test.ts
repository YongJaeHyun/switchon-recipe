import { describe, expect, it } from 'vitest';
import {
  computeExpiry,
  firstPurchaseDiscountViolations,
  GRACE_MS,
  hasUsedFirstPurchaseDiscount,
  purchasesBefore,
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
    expect(passProductOf('switchon_pass_5w_1900')).toMatchObject({ priceKrw: 1900, days: 35 });
    expect(passProductOf('switchon_pass_5w_2900')).toMatchObject({ priceKrw: 2900, days: 35 });
    expect(passProductOf('switchon_pass_5w_4900')).toMatchObject({ priceKrw: 4900, days: 35 });
    expect(passProductOf('switchon_pass_1w_1500')).toMatchObject({ priceKrw: 1500, days: 7 });
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
    expect(state.firstPurchaseDiscount).toBe(false);
  });

  it('시작 전: 11/1 00:00 KST 1초 전 — 판매하지 않음, 시작하면 2,900원 (운영자 결정)', () => {
    const state = getSalesState(new Date('2026-10-31T14:59:59Z'), setting);
    expect(state).toMatchObject({
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
      firstPurchaseDiscount: false,
    });
    expect(state.nextTier).toEqual({
      tier: 'early2',
      priceKrw: 2900,
      startsAt: '2026-10-31T15:00:00.000Z',
    });
  });

  it('1일째 시작: 11/1 00:00 KST — 첫 구매 할인 2,900원, 할인 기간이 끝나면 4,900원', () => {
    const state = getSalesState(new Date('2026-10-31T15:00:00Z'), setting);
    expect(state).toMatchObject({
      onSale: true,
      tier: 'early2',
      productId: 'switchon_pass_5w_2900',
      priceKrw: 2900,
      freeActive: true,
      freeDaysLeft: 14,
      firstPurchaseDiscount: true,
    });
    expect(state.nextTier).toEqual({
      tier: 'regular',
      priceKrw: 4900,
      startsAt: '2026-11-14T15:00:00.000Z',
    });
  });

  it('1,900원은 어느 때도 팔지 않는다 (8일째 전후 모두 2,900원)', () => {
    for (const at of ['2026-11-03T00:00:00Z', '2026-11-07T14:59:59Z', '2026-11-07T15:00:00Z']) {
      const state = getSalesState(new Date(at), setting);
      expect(state.productId).toBe('switchon_pass_5w_2900');
      expect(state.priceKrw).toBe(2900);
    }
  });

  it('14일째 끝: 아직 2,900원', () => {
    const state = getSalesState(new Date('2026-11-14T14:59:59Z'), setting);
    expect(state.tier).toBe('early2');
    expect(state.freeActive).toBe(true);
    expect(state.freeDaysLeft).toBe(1);
  });

  it('15일째: 모두 4,900원, 할인 표시 없음', () => {
    const state = getSalesState(new Date('2026-11-14T15:00:00Z'), setting);
    expect(state).toMatchObject({
      tier: 'regular',
      productId: 'switchon_pass_5w_4900',
      priceKrw: 4900,
      freeActive: false,
      freeDaysLeft: 0,
      nextTier: null,
      firstPurchaseDiscount: false,
    });
  });

  it('할인을 이미 쓴 유저는 할인 기간 안에도 4,900원, 다음 가격 안내 없음', () => {
    const state = getSalesState(new Date('2026-11-03T00:00:00Z'), setting, {
      discountUsed: true,
    });
    expect(state).toMatchObject({
      onSale: true,
      freeActive: true,
      tier: 'regular',
      productId: 'switchon_pass_5w_4900',
      priceKrw: 4900,
      nextTier: null,
      firstPurchaseDiscount: false,
    });
  });

  it('할인을 이미 쓴 유저: 시작 전 다음 가격은 4,900원', () => {
    const state = getSalesState(new Date('2026-10-31T14:59:59Z'), setting, {
      discountUsed: true,
    });
    expect(state.nextTier).toMatchObject({ tier: 'regular', priceKrw: 4900 });
  });
});

describe('hasUsedFirstPurchaseDiscount', () => {
  const row = (productId: string, status: PurchaseForExpiry['status']) => ({ productId, status });

  it('granted 5주 패스가 있으면 썼다 (가격과 무관, 옛 1,900원 포함)', () => {
    expect(hasUsedFirstPurchaseDiscount([row('switchon_pass_5w_2900', 'granted')])).toBe(true);
    expect(hasUsedFirstPurchaseDiscount([row('switchon_pass_5w_4900', 'granted')])).toBe(true);
    expect(hasUsedFirstPurchaseDiscount([row('switchon_pass_5w_1900', 'granted')])).toBe(true);
  });

  it('1주 패스, 환불·되돌린 5주 패스는 세지 않는다', () => {
    expect(
      hasUsedFirstPurchaseDiscount([
        row('switchon_pass_1w_1500', 'granted'),
        row('switchon_pass_5w_2900', 'voided'),
        row('switchon_pass_5w_2900', 'refunded_ineligible'),
      ])
    ).toBe(false);
    expect(hasUsedFirstPurchaseDiscount([])).toBe(false);
  });
});

describe('purchasesBefore', () => {
  const p = (token: string, at: string) => ({ purchaseToken: token, purchasedAt: new Date(at) });

  it('먼저 산 구매만, 같은 시각이면 토큰 순, 자기 자신은 빼고', () => {
    const list = [
      p('a', '2026-11-01T00:00:00Z'),
      p('b', '2026-11-02T00:00:00Z'),
      p('c', '2026-11-02T00:00:00Z'),
      p('d', '2026-11-03T00:00:00Z'),
    ];
    expect(
      purchasesBefore(list, p('c', '2026-11-02T00:00:00Z')).map((x) => x.purchaseToken)
    ).toEqual(['a', 'b']);
  });
});

describe('firstPurchaseDiscountViolations', () => {
  const purchase = (
    token: string,
    productId: string,
    at: string,
    status: PurchaseForExpiry['status'] = 'granted'
  ): PurchaseForExpiry => ({ purchaseToken: token, productId, purchasedAt: new Date(at), status });

  it('할인 구매 하나뿐이면 없음', () => {
    expect(
      firstPurchaseDiscountViolations([
        purchase('a', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
        purchase('w', 'switchon_pass_1w_1500', '2026-11-01T00:00:00Z'),
      ])
    ).toEqual([]);
  });

  it('동시에 산 할인 구매 둘: 늦게 산 쪽만', () => {
    expect(
      firstPurchaseDiscountViolations([
        purchase('late', 'switchon_pass_5w_2900', '2026-11-02T00:00:01Z'),
        purchase('early', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
      ])
    ).toEqual(['late']);
  });

  it('같은 시각이면 토큰 순으로 정한다', () => {
    expect(
      firstPurchaseDiscountViolations([
        purchase('b', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
        purchase('a', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
      ])
    ).toEqual(['b']);
  });

  it('먼저 산 4,900원 뒤의 할인 구매도 해당, 4,900원 구매 자체는 해당 없음', () => {
    expect(
      firstPurchaseDiscountViolations([
        purchase('regular', 'switchon_pass_5w_4900', '2026-11-01T00:00:00Z'),
        purchase('disc', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
        purchase('regular2', 'switchon_pass_5w_4900', '2026-11-03T00:00:00Z'),
      ])
    ).toEqual(['disc']);
  });

  it('먼저 산 구매가 환불(voided)됐으면 다음 할인 구매는 괜찮다', () => {
    expect(
      firstPurchaseDiscountViolations([
        purchase('old', 'switchon_pass_5w_2900', '2026-11-01T00:00:00Z', 'voided'),
        purchase('new', 'switchon_pass_5w_2900', '2026-11-02T00:00:00Z'),
      ])
    ).toEqual([]);
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
  const granted = (productId: string, status: PurchaseForExpiry['status'] = 'granted') => ({
    productId,
    status,
  });

  it('2,900원: 할인 기간 안 첫 5주 패스면 유효', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-11-02T00:00:00Z'), setting)
    ).toBe(true);
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-10-31T15:00:00Z'), setting)
    ).toBe(true);
  });

  it('2,900원: 할인 기간 시작 전이면 무효', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-10-31T14:59:59Z'), setting)
    ).toBe(false);
  });

  it('2,900원: 할인 기간 끝난 뒤 24시간 유예 안이면 유효, 정확히 24시간이면 무효', () => {
    expect(
      isPurchaseEligible(
        'switchon_pass_5w_2900',
        new Date(new Date('2026-11-14T15:00:00Z').getTime() + GRACE_MS - 1),
        setting
      )
    ).toBe(true);
    expect(
      isPurchaseEligible(
        'switchon_pass_5w_2900',
        new Date(new Date('2026-11-14T15:00:00Z').getTime() + GRACE_MS),
        setting
      )
    ).toBe(false);
  });

  it('2,900원: 설정이 없으면 무효', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-11-02T00:00:00Z'), noSetting)
    ).toBe(false);
  });

  it('2,900원: 먼저 산 granted 5주 패스가 있으면 무효 (2,900·4,900 모두)', () => {
    const at = new Date('2026-11-03T00:00:00Z');
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', at, setting, [granted('switchon_pass_5w_2900')])
    ).toBe(false);
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', at, setting, [granted('switchon_pass_5w_4900')])
    ).toBe(false);
  });

  it('2,900원: 먼저 산 것이 1주 패스이거나 환불된 5주 패스뿐이면 유효', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_2900', new Date('2026-11-03T00:00:00Z'), setting, [
        granted('switchon_pass_1w_1500'),
        granted('switchon_pass_5w_2900', 'voided'),
        granted('switchon_pass_5w_2900', 'refunded_ineligible'),
      ])
    ).toBe(true);
  });

  it('1,900원: 이제 팔지 않으므로 새 구매는 언제든 무효', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_1900', new Date('2026-11-03T00:00:00Z'), setting)
    ).toBe(false);
  });

  it('정가: 4900 아무 때나, 설정 null·이전 구매 포함', () => {
    expect(
      isPurchaseEligible('switchon_pass_5w_4900', new Date('2026-01-01T00:00:00Z'), setting)
    ).toBe(true);
    expect(
      isPurchaseEligible('switchon_pass_5w_4900', new Date('2026-01-01T00:00:00Z'), noSetting)
    ).toBe(true);
    expect(
      isPurchaseEligible('switchon_pass_5w_4900', new Date('2026-11-03T00:00:00Z'), setting, [
        granted('switchon_pass_5w_2900'),
      ])
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
  ): PurchaseForExpiry => ({
    purchaseToken: `${productId}@${purchasedAt}`,
    productId,
    purchasedAt: new Date(purchasedAt),
    status,
  });

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
  ): PurchaseForExpiry => ({
    purchaseToken: `${productId}@${purchasedAt}`,
    productId,
    purchasedAt: new Date(purchasedAt),
    status,
  });
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

describe('computeExpiry: 한 주 더 하기 연장 (구매에 묶인 연장, 구매당 상한)', () => {
  const p = (
    token: string,
    purchasedAt: string,
    status: PurchaseForExpiry['status'] = 'granted',
    productId = 'switchon_pass_5w_4900'
  ): PurchaseForExpiry => ({
    purchaseToken: token,
    productId,
    purchasedAt: new Date(purchasedAt),
    status,
  });
  const ext = (token: string, extendedAt: string) => ({
    purchaseToken: token,
    extendedAt: new Date(extendedAt),
  });
  const at = (iso: string) => new Date(iso).getTime();
  const A = '2026-11-01T10:00:00Z';

  it('PASS_EXTENSION_DAYS는 7일, 상품별 연장 상한: 5주 2번, 1주 0번', () => {
    expect(PASS_EXTENSION_DAYS).toBe(7);
    expect(passProductOf('switchon_pass_5w_1900')?.maxExtensions).toBe(2);
    expect(passProductOf('switchon_pass_5w_4900')?.maxExtensions).toBe(2);
    expect(passProductOf('switchon_pass_1w_1500')?.maxExtensions).toBe(0);
  });

  it('패스 기간 중 연장: 만료일 +7일', () => {
    expect(computeExpiry([p('a', A)], [ext('a', '2026-11-20T00:00:00Z')])?.getTime()).toBe(
      at(A) + 42 * DAY
    );
  });

  it('5주 구매 하나에 연장은 2번까지만 반영한다 (행이 더 있어도)', () => {
    expect(
      computeExpiry(
        [p('a', A)],
        [
          ext('a', '2026-11-10T00:00:00Z'),
          ext('a', '2026-11-17T00:00:00Z'),
          ext('a', '2026-11-24T00:00:00Z'),
          ext('a', '2026-12-01T00:00:00Z'),
        ]
      )?.getTime()
    ).toBe(at(A) + 49 * DAY);
  });

  it('1주 패스에 묶인 연장은 반영하지 않는다', () => {
    expect(
      computeExpiry(
        [p('w', A, 'granted', 'switchon_pass_1w_1500')],
        [ext('w', '2026-11-03T00:00:00Z')]
      )?.getTime()
    ).toBe(at(A) + 7 * DAY);
  });

  it('구매마다 따로 센다: 5주 두 번이면 연장 4번까지', () => {
    const B = '2026-11-20T10:00:00Z';
    expect(
      computeExpiry(
        [p('a', A), p('b', B)],
        [
          ext('a', '2026-11-10T00:00:00Z'),
          ext('a', '2026-11-17T00:00:00Z'),
          ext('b', '2026-11-24T00:00:00Z'),
          ext('b', '2026-12-01T00:00:00Z'),
          ext('b', '2026-12-08T00:00:00Z'),
        ]
      )?.getTime()
    ).toBe(at(A) + (70 + 28) * DAY);
  });

  it('묶인 구매가 없거나(모르는 토큰) 환불됐으면 반영하지 않는다', () => {
    expect(computeExpiry([p('a', A)], [ext('zzz', '2026-11-20T00:00:00Z')])?.getTime()).toBe(
      at(A) + 35 * DAY
    );
    expect(
      computeExpiry(
        [p('a', A), p('b', '2026-11-10T10:00:00Z', 'voided')],
        [ext('b', '2026-11-20T00:00:00Z')]
      )?.getTime()
    ).toBe(at(A) + 35 * DAY);
    expect(computeExpiry([p('a', A, 'voided')], [ext('a', '2026-11-20T00:00:00Z')])).toBeNull();
  });

  it('묶인 구매보다 앞선 연장(구매 전 시각)은 반영하지 않는다', () => {
    expect(computeExpiry([p('a', A)], [ext('a', '2026-10-20T00:00:00Z')])?.getTime()).toBe(
      at(A) + 35 * DAY
    );
  });

  it('연장 시각에 패스가 끝나 있었으면 반영하지 않는다', () => {
    expect(computeExpiry([p('a', A)], [ext('a', '2026-12-20T00:00:00Z')])?.getTime()).toBe(
      at(A) + 35 * DAY
    );
  });

  it('연장 뒤 새 구매: 연장된 만료일 뒤에 이어 붙인다 (연장분이 사라지지 않음)', () => {
    expect(
      computeExpiry(
        [p('a', A), p('b', '2026-11-25T10:00:00Z')],
        [ext('a', '2026-11-20T00:00:00Z')]
      )?.getTime()
    ).toBe(at(A) + 77 * DAY);
  });

  it('연장만 있고 구매가 없으면 null', () => {
    expect(computeExpiry([], [ext('a', '2026-11-20T00:00:00Z')])).toBeNull();
  });
});

describe('GRACE_MS', () => {
  it('is 24 hours in ms', () => {
    expect(GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
