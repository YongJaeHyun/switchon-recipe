import { beforeEach, describe, expect, it, vi } from 'vitest';

const iap = vi.hoisted(() => ({
  initConnection: vi.fn(),
  getAvailablePurchases: vi.fn(),
  fetchProducts: vi.fn(),
  requestPurchase: vi.fn(),
}));

vi.mock('expo-iap', () => iap);
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const { recoverPendingPurchases, getUnconsumedPassPurchases } = await import('./billing');

// Play Purchase.PurchaseState: 1 = PURCHASED, 2 = PENDING
const purchase = (productId: string, purchaseToken: string, purchaseStateAndroid = 1) => ({
  productId,
  purchaseToken,
  purchaseStateAndroid,
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

    expect(await recoverPendingPurchases(verify)).toBe(2);
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

    expect(await recoverPendingPurchases(verify)).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('조회 실패 시 0을 반환하고 throw하지 않는다', async () => {
    iap.getAvailablePurchases.mockRejectedValue(new Error('billing unavailable'));
    const verify = vi.fn();

    expect(await recoverPendingPurchases(verify)).toBe(0);
    expect(verify).not.toHaveBeenCalled();
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

    expect(await getUnconsumedPassPurchases()).toEqual([
      { productId: 'switchon_pass_5w_1900', purchaseToken: 'token-a' },
    ]);
  });
});
