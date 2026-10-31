// 스위치온 패스 구매 검증 로직. 외부 의존성은 VerifyDeps로 주입한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import type { createGooglePlayClient, ProductPurchase } from '../_shared/googlePlay.ts';
import {
  computeExpiry,
  isPurchaseEligible,
  passProductOf,
  type PremiumSetting,
  type PurchaseForExpiry,
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
  // 이미 기록된 구매. uid는 탈퇴(on delete set null)면 null
  findPurchase(token: string): Promise<{ status: string; uid: string | null } | null>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  insertPurchase(row: PurchaseRow): Promise<'inserted' | 'duplicate'>; // unique 위반이면 'duplicate'
  // user_pass 만료일을 greatest(기존, expiresAt)로 올리고 저장된 값을 돌려준다 (줄이지 않음)
  raisePassExpiry(uid: string, expiresAt: Date): Promise<Date>;
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

// 전체 구매로 만료일을 다시 계산해 user_pass에 반영한다 (동시 요청이 짧은 값으로 덮어쓰지 못하게 raise만 한다)
const syncPassExpiry = async (deps: VerifyDeps, uid: string): Promise<Date | null> => {
  const expiry = computeExpiry(await deps.listUserPurchases(uid));
  return expiry ? deps.raisePassExpiry(uid, expiry) : null;
};

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
  processed: { status: string; uid: string | null }
): Promise<VerifyResult> => {
  if (processed.status === 'granted') await tryConsume(deps, input.productId, input.purchaseToken);
  // 다른 유저(또는 탈퇴한 유저)의 구매다. 그 유저의 만료일을 요청한 유저에게 알려주거나 동기화하지 않는다
  if (processed.uid !== input.uid) return { status: 'invalid' };

  // 이전 요청이 insert 후 만료일 기록 전에 끊겼어도 여기서 복구된다
  const expiry = await syncPassExpiry(deps, input.uid);
  return { status: 'already_processed', passExpiresAt: expiry ? expiry.toISOString() : null };
};

const isValidPurchase = (purchase: ProductPurchase, input: VerifyInput) =>
  purchase.purchaseState === PURCHASED &&
  purchase.obfuscatedExternalAccountId === input.uid &&
  (purchase.productId === undefined || purchase.productId === input.productId);

// 이 구매가 더해 주는 구간: 이 구매 이전의 granted 구매로 만든 만료일 뒤에 상품 일수만큼 이어 붙인다
const grantedInterval = (
  existing: PurchaseForExpiry[],
  productId: string,
  days: number,
  purchasedAt: Date
) => {
  const before = existing.filter((p) => p.purchasedAt.getTime() <= purchasedAt.getTime());
  const grantedUntil = computeExpiry([
    ...before,
    { productId, purchasedAt, status: 'granted' },
  ]) as Date;
  const grantedFrom = new Date(grantedUntil.getTime() - days * DAY_MS);
  return { grantedFrom, grantedUntil };
};

export async function verifyPurchase(deps: VerifyDeps, input: VerifyInput): Promise<VerifyResult> {
  const product = passProductOf(input.productId);
  if (!product) return { status: 'invalid' };

  const processed = await deps.findPurchase(input.purchaseToken);
  if (processed) return alreadyProcessed(deps, input, processed);

  const purchase = await deps.play.getProductPurchase(input.productId, input.purchaseToken);
  if (!isValidPurchase(purchase, input)) return { status: 'invalid' };

  const purchasedAt = new Date(Number(purchase.purchaseTimeMillis));
  const baseRow = {
    uid: input.uid,
    productId: input.productId,
    purchaseToken: input.purchaseToken,
    orderId: purchase.orderId ?? null,
    priceKrw: product.priceKrw,
    purchasedAt,
    raw: purchase,
  };

  const setting = await deps.getSetting();
  if (!isPurchaseEligible(input.productId, purchasedAt, setting)) {
    if (purchase.orderId) {
      await deps.play.refundOrder(purchase.orderId);
    } else {
      // 구매 토큰은 결제 증빙이므로 로그에는 앞부분만 남긴다
      console.error(
        '유예 밖 구매인데 orderId가 없어 환불하지 못함:',
        `${input.purchaseToken.slice(0, 8)}…`
      );
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
    input.productId,
    product.days,
    purchasedAt
  );
  const inserted = await deps.insertPurchase({
    ...baseRow,
    grantedFrom,
    grantedUntil,
    status: 'granted',
  });
  // Play 구매의 계정이 요청한 유저와 같음을 위에서 확인했으므로 같은 uid의 동시 요청이다
  if (inserted === 'duplicate') {
    return alreadyProcessed(deps, input, { status: 'granted', uid: input.uid });
  }

  // 동시에 처리된 다른 구매도 반영되도록 insert 후 전체 구매로 다시 계산한다
  const expiry = (await syncPassExpiry(deps, input.uid)) as Date;

  await tryConsume(deps, input.productId, input.purchaseToken);

  return { status: 'granted', passExpiresAt: expiry.toISOString() };
}
