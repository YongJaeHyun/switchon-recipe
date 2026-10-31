import { beforeEach, describe, expect, it, vi } from 'vitest';

const iap = vi.hoisted(() => ({
  initConnection: vi.fn(),
  getAvailablePurchases: vi.fn(),
  fetchProducts: vi.fn(),
  requestPurchase: vi.fn(),
}));

vi.mock('expo-iap', () => iap);
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const { recoverPendingPurchases, getUnconsumedPassPurchases, purchasePass, isBillingAvailable } =
  await import('./billing');

const UID = 'uid-1';

// Play Purchase.PurchaseState: 1 = PURCHASED, 2 = PENDING
const purchase = (
  productId: string,
  purchaseToken: string,
  purchaseStateAndroid = 1,
  obfuscatedAccountIdAndroid = UID
) => ({
  productId,
  purchaseToken,
  purchaseStateAndroid,
  obfuscatedAccountIdAndroid,
  platform: 'android',
});

describe('recoverPendingPurchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iap.initConnection.mockResolvedValue(true);
  });

  it('미소비 구매 2개 → verify 2회 호출 → 2를 반환', async () => {
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-a'),
      purchase('switchon_pass_5w_2900', 'token-b'),
    ]);
    const verify = vi.fn().mockResolvedValue({ status: 'granted' });

    expect(await recoverPendingPurchases(UID, verify)).toBe(2);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledWith({
      productId: 'switchon_pass_5w_1900',
      purchaseToken: 'token-a',
    });
    expect(verify).toHaveBeenCalledWith({
      productId: 'switchon_pass_5w_2900',
      purchaseToken: 'token-b',
    });
  });

  it('verify가 throw해도 나머지는 계속 처리한다', async () => {
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-a'),
      purchase('switchon_pass_5w_2900', 'token-b'),
    ]);
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 'granted' });

    expect(await recoverPendingPurchases(UID, verify)).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('조회 실패 시 0을 반환하고 throw하지 않는다', async () => {
    iap.getAvailablePurchases.mockRejectedValue(new Error('billing unavailable'));
    const verify = vi.fn();

    expect(await recoverPendingPurchases(UID, verify)).toBe(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it('같은 기기의 다른 계정 구매는 보내지 않는다', async () => {
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-mine'),
      purchase('switchon_pass_5w_2900', 'token-other-account', 1, 'uid-2'),
    ]);
    const verify = vi.fn().mockResolvedValue({ status: 'granted' });

    expect(await recoverPendingPurchases(UID, verify)).toBe(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith({
      productId: 'switchon_pass_5w_1900',
      purchaseToken: 'token-mine',
    });
  });
});

describe('getUnconsumedPassPurchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iap.initConnection.mockResolvedValue(true);
  });

  it('패스 상품의 결제 완료 구매만 돌려준다 (보류 중, 다른 상품 제외)', async () => {
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-a'),
      purchase('switchon_pass_5w_4900', 'token-pending', 2),
      purchase('other_product', 'token-other'),
    ]);

    expect(await getUnconsumedPassPurchases(UID)).toEqual([
      { productId: 'switchon_pass_5w_1900', purchaseToken: 'token-a' },
    ]);
  });

  it('1주 패스(switchon_pass_1w_1500) 미소비 구매도 복구 대상이다', async () => {
    iap.getAvailablePurchases.mockResolvedValue([purchase('switchon_pass_1w_1500', 'token-week')]);

    expect(await getUnconsumedPassPurchases(UID)).toEqual([
      { productId: 'switchon_pass_1w_1500', purchaseToken: 'token-week' },
    ]);
  });

  it('obfuscatedAccountIdAndroid가 현재 uid와 다르거나 없으면 제외한다', async () => {
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-mine'),
      purchase('switchon_pass_5w_2900', 'token-other-account', 1, 'uid-2'),
      {
        ...purchase('switchon_pass_5w_4900', 'token-no-account'),
        obfuscatedAccountIdAndroid: undefined,
      },
    ]);

    expect(await getUnconsumedPassPurchases(UID)).toEqual([
      { productId: 'switchon_pass_5w_1900', purchaseToken: 'token-mine' },
    ]);
  });
});

describe('isBillingAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('연결되면 true', async () => {
    iap.initConnection.mockResolvedValue(true);
    expect(await isBillingAvailable()).toBe(true);
  });

  it('연결할 수 없으면(BillingUnavailableError) false, throw하지 않음', async () => {
    // 앞 테스트의 연결 캐시를 쓰지 않도록 모듈을 새로 불러온다
    vi.resetModules();
    const fresh = await import('./billing');
    iap.initConnection.mockRejectedValue(new Error('no native module'));
    expect(await fresh.isBillingAvailable()).toBe(false);
  });
});

describe('purchasePass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    iap.initConnection.mockResolvedValue(true);
    iap.fetchProducts.mockResolvedValue([]);
  });

  it('uid를 obfuscatedAccountIdAndroid로 넘기고 구매를 돌려준다', async () => {
    iap.requestPurchase.mockResolvedValue([purchase('switchon_pass_5w_1900', 'token-new')]);

    expect(await purchasePass('switchon_pass_5w_1900', 'uid-1')).toEqual({
      productId: 'switchon_pass_5w_1900',
      purchaseToken: 'token-new',
    });
    expect(iap.requestPurchase).toHaveBeenCalledWith({
      request: {
        android: { skus: ['switchon_pass_5w_1900'], obfuscatedAccountIdAndroid: 'uid-1' },
      },
      type: 'inapp',
    });
  });

  it('1주 패스도 같은 흐름으로 결제한다', async () => {
    iap.requestPurchase.mockResolvedValue([purchase('switchon_pass_1w_1500', 'token-week')]);

    expect(await purchasePass('switchon_pass_1w_1500', 'uid-1')).toEqual({
      productId: 'switchon_pass_1w_1500',
      purchaseToken: 'token-week',
    });
    expect(iap.fetchProducts).toHaveBeenCalledWith({
      skus: ['switchon_pass_1w_1500'],
      type: 'inapp',
    });
  });

  it('취소 → null', async () => {
    iap.requestPurchase.mockRejectedValue({ code: 'E_USER_CANCELLED' });
    expect(await purchasePass('switchon_pass_5w_1900', 'uid-1')).toBeNull();
  });

  it('E_ALREADY_OWNED → 미소비 기존 구매를 돌려준다', async () => {
    iap.requestPurchase.mockRejectedValue({ code: 'E_ALREADY_OWNED' });
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_2900', 'token-other'),
      purchase('switchon_pass_5w_1900', 'token-owned'),
    ]);

    expect(await purchasePass('switchon_pass_5w_1900', 'uid-1')).toEqual({
      productId: 'switchon_pass_5w_1900',
      purchaseToken: 'token-owned',
    });
  });

  it('E_ALREADY_OWNED인데 같은 상품의 미소비 구매가 다른 계정 것이면 돌려주지 않고 원래 오류를 던진다', async () => {
    const error = { code: 'E_ALREADY_OWNED' };
    iap.requestPurchase.mockRejectedValue(error);
    iap.getAvailablePurchases.mockResolvedValue([
      purchase('switchon_pass_5w_1900', 'token-other-account', 1, 'uid-2'),
    ]);

    await expect(purchasePass('switchon_pass_5w_1900', 'uid-1')).rejects.toBe(error);
  });

  it('E_ALREADY_OWNED인데 기존 구매를 못 찾으면 원래 오류를 던진다', async () => {
    const error = { code: 'E_ALREADY_OWNED' };
    iap.requestPurchase.mockRejectedValue(error);
    iap.getAvailablePurchases.mockResolvedValue([]);

    await expect(purchasePass('switchon_pass_5w_1900', 'uid-1')).rejects.toBe(error);
  });
});
