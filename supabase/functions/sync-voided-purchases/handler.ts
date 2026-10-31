// 환불된 패스 구매 회수: Google Play의 무효화 구매(voided purchase) 목록을 가져와
// 해당 pass_purchase를 voided로 표시하고, 영향받은 유저의 패스 만료일을 다시 계산한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

import type { VoidedPurchase } from '../_shared/googlePlay.ts';
import { computeExpiry, type ExtensionForExpiry, type PurchaseForExpiry } from '../_shared/pass.ts';

export interface VoidedDeps {
  listVoided(sinceMillis: number): Promise<VoidedPurchase[]>;
  findPurchasesByTokens(
    tokens: string[]
  ): Promise<{ purchaseToken: string; uid: string | null; status: string }[]>;
  markVoided(tokens: string[]): Promise<void>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  // 한 주 더 하기 연장 기록 (pass_extension). 정확한 값으로 덮어쓸 때 연장분이 지워지지 않게 함께 쌓는다
  listUserExtensions(uid: string): Promise<ExtensionForExpiry[]>;
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
  if (found.length === 0) return { voided: 0, usersUpdated: 0 }; // 모르는 토큰뿐이면 할 일 없음

  // granted 토큰만 voided로 표시한다. refunded_ineligible(서버가 이미 환불한 건)은 감사 흔적을
  // 위해 건드리지 않고, 이미 voided인 토큰도 다시 마킹하지 않는다.
  const toMark = found.filter((f) => f.status === 'granted').map((f) => f.purchaseToken);
  if (toMark.length > 0) await deps.markVoided(toMark);

  // 부분 실패(markVoided 성공 후 setPassExpiry 실패)나 verify-pass-purchase와의 레이스로 저장된
  // 만료일이 틀어졌을 수 있다. 그래서 이번에 새로 마킹한 토큰뿐 아니라, found에 있던 모든 토큰
  // (이미 voided였던 것 포함)의 유저도 매번 현재 granted 구매 기준으로 다시 계산해 덮어쓴다.
  // 탈퇴(uid null)한 구매는 voided 표시만 하고 재계산 대상에서 제외한다.
  const uids = [...new Set(found.map((f) => f.uid).filter((uid): uid is string => uid !== null))];
  for (const uid of uids) {
    const [purchases, extensions] = await Promise.all([
      deps.listUserPurchases(uid),
      deps.listUserExtensions(uid),
    ]);
    const expiry = computeExpiry(purchases, extensions);
    await deps.setPassExpiry(uid, expiry);
  }

  return { voided: toMark.length, usersUpdated: uids.length };
}
