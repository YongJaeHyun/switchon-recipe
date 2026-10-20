// Google Play 결제 계층. 결제 라이브러리(expo-iap) 의존은 이 파일에만 둔다.
//
// - 구매 확인(acknowledge)/소비(consume)는 서버(verify-pass-purchase)만 한다. 앱은 finishTransaction을
//   부르지 않는다. 서버 검증 전에 앱이 소비하면 결제 누락을 복구할 수 없다.
// - 네이티브 모듈이 없는 빌드(구 dev 빌드, Vitest)에서도 import만으로 앱이 죽지 않도록
//   expo-iap는 처음 쓸 때 동적으로 불러온다. expo-iap는 import 시점에 네이티브 모듈을 요구한다.

import { Platform } from 'react-native';
import { PASS_PRODUCT_IDS, type PassPurchase } from 'types/pass';

type ExpoIap = typeof import('expo-iap');
type IapPurchase = Awaited<ReturnType<ExpoIap['getAvailablePurchases']>>[number];

// Play Purchase.PurchaseState
const PURCHASE_STATE_PURCHASED = 1;
const USER_CANCELLED = 'E_USER_CANCELLED';
const ALREADY_OWNED = 'E_ALREADY_OWNED';

export class BillingUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('billing unavailable');
    this.name = 'BillingUnavailableError';
    this.cause = cause;
  }
}

let iapPromise: Promise<ExpoIap> | null = null;
let connectionPromise: Promise<ExpoIap> | null = null;

const loadIap = (): Promise<ExpoIap> => {
  if (!iapPromise) {
    iapPromise =
      Platform.OS === 'android'
        ? import('expo-iap')
        : Promise.reject(new Error('Google Play 결제는 Android에서만 지원'));
  }
  return iapPromise;
};

const connect = (): Promise<ExpoIap> => {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const iap = await loadIap();
      await iap.initConnection();
      return iap;
    })().catch((error) => {
      // 다음 호출에서 다시 연결을 시도한다
      connectionPromise = null;
      throw new BillingUnavailableError(error);
    });
  }
  return connectionPromise;
};

const isPassProduct = (productId: string) =>
  (PASS_PRODUCT_IDS as readonly string[]).includes(productId);

const toPassPurchase = (purchase: IapPurchase): PassPurchase | null => {
  if (purchase.platform !== 'android') return null;
  // 보류 중(PENDING) 결제는 아직 돈이 안 들어왔다. 결제 완료로 바뀐 뒤 복구 때 서버로 보낸다
  if (purchase.purchaseStateAndroid !== PURCHASE_STATE_PURCHASED) return null;
  if (!purchase.purchaseToken || !isPassProduct(purchase.productId)) return null;
  return { productId: purchase.productId, purchaseToken: purchase.purchaseToken };
};

const hasErrorCode = (error: unknown, code: string) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;

// 결제 연결. 네이티브 모듈이 없거나 Play 서비스를 쓸 수 없으면 BillingUnavailableError로 실패
export async function initBilling(): Promise<void> {
  await connect();
}

// 이 바이너리에서 결제를 쓸 수 있는지. 결제 모듈이 없는 빌드(같은 runtime version의 구 빌드 등)는 false
export async function isBillingAvailable(): Promise<boolean> {
  try {
    await initBilling();
    return true;
  } catch (error) {
    if (!(error instanceof BillingUnavailableError))
      console.error('[billing.isBillingAvailable]', error);
    return false;
  }
}

// 상품의 Play 표시 가격. 조회할 수 없으면 null
export async function getProduct(
  productId: string
): Promise<{ productId: string; displayPrice: string } | null> {
  try {
    const iap = await connect();
    const products = await iap.fetchProducts({ skus: [productId], type: 'inapp' });
    const product = products.find((p) => p.id === productId);
    return product ? { productId: product.id, displayPrice: product.displayPrice } : null;
  } catch (error) {
    console.error('[billing.getProduct]', error);
    return null;
  }
}

// Play 결제창을 띄운다. 취소하거나 결제가 보류 중이면 null. 그 밖의 실패는 throw
// 이미 보유 중(서버가 아직 소비 안 한 같은 상품 구매가 있음)이면 그 구매를 돌려줘서 호출부가 검증하게 한다 (서버는 멱등)
// uid는 obfuscatedAccountIdAndroid로 넘기고, 서버가 요청한 유저와 같은지 확인한다
export async function purchasePass(productId: string, uid: string): Promise<PassPurchase | null> {
  const iap = await connect();
  // 네이티브 모듈은 상품 상세를 먼저 조회해 둬야 결제할 수 있다
  await iap.fetchProducts({ skus: [productId], type: 'inapp' });

  try {
    const result = await iap.requestPurchase({
      request: { android: { skus: [productId], obfuscatedAccountIdAndroid: uid } },
      type: 'inapp',
    });
    const purchases = Array.isArray(result) ? result : result ? [result] : [];
    const purchase = purchases
      .map(toPassPurchase)
      .find((p): p is PassPurchase => p?.productId === productId);
    return purchase ?? null;
  } catch (error) {
    if (hasErrorCode(error, USER_CANCELLED)) return null;
    if (hasErrorCode(error, ALREADY_OWNED)) {
      const owned = (await getUnconsumedPassPurchases(uid)).find((p) => p.productId === productId);
      if (owned) return owned;
    }
    throw error;
  }
}

// 서버가 아직 소비하지 않은 이 계정(uid)의 패스 구매 (결제 완료 상태만).
// 같은 Google 계정으로 여러 앱 계정을 쓰면 다른 앱 계정의 구매도 보이므로, 결제 때 넘긴
// obfuscatedAccountIdAndroid가 uid와 같은 것만 돌려준다 (서버도 다른 계정 구매는 invalid로 거절)
export async function getUnconsumedPassPurchases(uid: string): Promise<PassPurchase[]> {
  const iap = await connect();
  const purchases = await iap.getAvailablePurchases();
  return purchases
    .filter((p) => p.platform === 'android' && p.obfuscatedAccountIdAndroid === uid)
    .map(toPassPurchase)
    .filter((p): p is PassPurchase => p !== null);
}

// 결제 누락 복구: 미소비 구매를 하나씩 서버로 다시 보낸다. 하나가 실패해도 나머지는 계속한다.
// 서버 검증 요청에 성공한 개수를 돌려준다. 결제를 쓸 수 없으면 0 (throw하지 않음)
export async function recoverPendingPurchases(
  uid: string,
  verify: (p: PassPurchase) => Promise<unknown>
): Promise<number> {
  let purchases: PassPurchase[];
  try {
    purchases = await getUnconsumedPassPurchases(uid);
  } catch (error) {
    console.error('[billing.recoverPendingPurchases]', error);
    return 0;
  }

  let verified = 0;
  for (const purchase of purchases) {
    try {
      await verify(purchase);
      verified += 1;
    } catch (error) {
      console.error('[billing.recoverPendingPurchases] verify 실패', error);
    }
  }
  return verified;
}
