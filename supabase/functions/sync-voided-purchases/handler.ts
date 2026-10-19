// 환불된 패스 구매 회수: Google Play의 무효화 구매(voided purchase) 목록을 가져와
// 해당 pass_purchase를 voided로 표시하고, 영향받은 유저의 패스 만료일을 다시 계산한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import type { VoidedPurchase } from '../_shared/googlePlay.ts';
import { computeExpiry, type PurchaseForExpiry } from '../_shared/pass.ts';

export interface VoidedDeps {
  listVoided(sinceMillis: number): Promise<VoidedPurchase[]>;
  findPurchasesByTokens(
    tokens: string[]
  ): Promise<{ purchaseToken: string; uid: string | null; status: string }[]>;
  markVoided(tokens: string[]): Promise<void>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  // 환불 회수는 만료일을 낮추거나 패스를 없앨 수 있어야 하므로 raise가 아니라 정확한 값으로 쓴다
  setPassExpiry(uid: string, expiresAt: Date | null): Promise<void>;
}

export async function syncVoided(
  deps: VoidedDeps,
  sinceMillis: number
): Promise<{ voided: number; usersUpdated: number }> {
  const voidedPurchases = await deps.listVoided(sinceMillis);
  if (voidedPurchases.length === 0) return { voided: 0, usersUpdated: 0 };

  const tokens = voidedPurchases.map((v) => v.purchaseToken);
  const found = await deps.findPurchasesByTokens(tokens);

  // 모르는 토큰(findPurchasesByTokens가 안 돌려줌)과 이미 voided인 토큰은 건너뛴다
  const toVoid = found.filter((f) => f.status !== 'voided');
  if (toVoid.length === 0) return { voided: 0, usersUpdated: 0 };

  await deps.markVoided(toVoid.map((f) => f.purchaseToken));

  // 탈퇴(uid null)한 구매는 voided 표시만 하고 만료일 재계산은 하지 않는다
  const uids = [...new Set(toVoid.map((f) => f.uid).filter((uid): uid is string => uid !== null))];
  for (const uid of uids) {
    const purchases = await deps.listUserPurchases(uid);
    const expiry = computeExpiry(purchases);
    await deps.setPassExpiry(uid, expiry);
  }

  return { voided: toVoid.length, usersUpdated: uids.length };
}
