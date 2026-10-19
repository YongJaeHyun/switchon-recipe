// 스위치온 패스 구매 검증 로직. 외부 의존성은 VerifyDeps로 주입한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import type { createGooglePlayClient, ProductPurchase } from '../_shared/googlePlay.ts';
import {
  computeExpiry,
  isPurchaseEligible,
  PASS_DAYS,
  PASS_PRODUCTS,
  type PremiumSetting,
  type PurchaseForExpiry,
  tierOfProduct,
} from '../_shared/pass.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
// Play 구매 상태: 0 = 결제 완료
const PURCHASED = 0;

export type VerifyResult =
  | { status: 'granted'; passExpiresAt: string }
  | { status: 'already_processed'; passExpiresAt: string | null }
  | { status: 'price_changed' } // 유예 밖 → 환불함
  | { status: 'invalid' }; // 미결제, 다른 계정, 모르는 상품

// pass_purchase 테이블 한 행 (camelCase)
export interface PurchaseRow {
  uid: string;
  productId: string;
  purchaseToken: string;
  orderId: string | null;
  priceKrw: number | null;
  purchasedAt: Date;
  grantedFrom: Date | null;
  grantedUntil: Date | null;
  status: PurchaseForExpiry['status'];
  raw: unknown;
}

export interface VerifyDeps {
  now(): Date;
  getSetting(): Promise<PremiumSetting>;
  findPurchase(token: string): Promise<{ status: string } | null>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  insertPurchase(row: PurchaseRow): Promise<'inserted' | 'duplicate'>; // unique 위반이면 'duplicate'
  setPassExpiry(uid: string, expiresAt: Date | null): Promise<void>; // null이면 user_pass 삭제
  play: Pick<
    ReturnType<typeof createGooglePlayClient>,
    'getProductPurchase' | 'consumeProductPurchase' | 'refundOrder'
  >;
}

export interface VerifyInput {
  uid: string;
  productId: string;
  purchaseToken: string;
}

const toIso = (date: Date | null) => (date ? date.toISOString() : null);

// 소비 실패는 결과를 바꾸지 않는다. 다음 복구 요청의 already_processed 경로에서 다시 시도한다
const tryConsume = async (deps: VerifyDeps, productId: string, token: string) => {
  try {
    await deps.play.consumeProductPurchase(productId, token);
  } catch (error) {
    console.error('패스 구매 consume 실패:', error);
  }
};

const alreadyProcessed = async (
  deps: VerifyDeps,
  input: VerifyInput,
  status: string
): Promise<VerifyResult> => {
  if (status === 'granted') await tryConsume(deps, input.productId, input.purchaseToken);
  const expiry = computeExpiry(await deps.listUserPurchases(input.uid));
  return { status: 'already_processed', passExpiresAt: toIso(expiry) };
};

const isValidPurchase = (purchase: ProductPurchase, input: VerifyInput) =>
  purchase.purchaseState === PURCHASED &&
  purchase.obfuscatedExternalAccountId === input.uid &&
  (purchase.productId === undefined || purchase.productId === input.productId);

// 이 구매가 더해 주는 구간: 이 구매 이전의 granted 구매로 만든 만료일 뒤에 이어 붙인다
const grantedInterval = (existing: PurchaseForExpiry[], purchasedAt: Date) => {
  const before = existing.filter((p) => p.purchasedAt.getTime() <= purchasedAt.getTime());
  const grantedUntil = computeExpiry([...before, { purchasedAt, status: 'granted' }]) as Date;
  const grantedFrom = new Date(grantedUntil.getTime() - PASS_DAYS * DAY_MS);
  return { grantedFrom, grantedUntil };
};

export async function verifyPurchase(deps: VerifyDeps, input: VerifyInput): Promise<VerifyResult> {
  const tier = tierOfProduct(input.productId);
  if (!tier) return { status: 'invalid' };

  const processed = await deps.findPurchase(input.purchaseToken);
  if (processed) return alreadyProcessed(deps, input, processed.status);

  const purchase = await deps.play.getProductPurchase(input.productId, input.purchaseToken);
  if (!isValidPurchase(purchase, input)) return { status: 'invalid' };

  const purchasedAt = new Date(Number(purchase.purchaseTimeMillis));
  const baseRow = {
    uid: input.uid,
    productId: input.productId,
    purchaseToken: input.purchaseToken,
    orderId: purchase.orderId ?? null,
    priceKrw: PASS_PRODUCTS[tier].priceKrw,
    purchasedAt,
    raw: purchase,
  };

  const setting = await deps.getSetting();
  if (!isPurchaseEligible(input.productId, purchasedAt, setting)) {
    if (purchase.orderId) {
      await deps.play.refundOrder(purchase.orderId);
    } else {
      console.error('유예 밖 구매인데 orderId가 없어 환불하지 못함:', input.purchaseToken);
    }
    await deps.insertPurchase({
      ...baseRow,
      grantedFrom: null,
      grantedUntil: null,
      status: 'refunded_ineligible',
    });
    return { status: 'price_changed' };
  }

  const { grantedFrom, grantedUntil } = grantedInterval(
    await deps.listUserPurchases(input.uid),
    purchasedAt
  );
  const inserted = await deps.insertPurchase({
    ...baseRow,
    grantedFrom,
    grantedUntil,
    status: 'granted',
  });
  if (inserted === 'duplicate') return alreadyProcessed(deps, input, 'granted');

  // 동시에 처리된 다른 구매도 반영되도록 insert 후 전체 구매로 다시 계산한다
  const expiry = computeExpiry(await deps.listUserPurchases(input.uid));
  await deps.setPassExpiry(input.uid, expiry);

  await tryConsume(deps, input.productId, input.purchaseToken);

  return { status: 'granted', passExpiresAt: toIso(expiry) as string };
}
