// 서버(supabase/functions/_shared/pass.ts, get-pass-status, verify-pass-purchase/handler.ts)와
// 같은 모양의 앱 쪽 타입. Deno 파일을 앱에서 import하지 않기 위해 복사해 둔다. 날짜는 JSON의 ISO 문자열.

export type PassTier = 'early1' | 'early2' | 'regular';

export interface SalesState {
  onSale: boolean;
  freeActive: boolean;
  tier: PassTier | null;
  productId: string | null;
  priceKrw: number | null;
  freeDaysLeft: number; // 오늘 포함, 무료 기간 아니면 0
  nextTier: { tier: PassTier; priceKrw: number; startsAt: string } | null; // ISO, 다음 가격 변경 시각
  // 1주 패스 (가격 고정). 판매 중이 아니면 null, 이 필드를 모르는 구버전 서버면 없음
  weekPass?: { productId: string; priceKrw: number; days: number } | null;
}

export interface PassStatus {
  sales: SalesState;
  passExpiresAt: string | null; // ISO
  hasAccess: boolean; // 서버 has_premium_access_for 결과 (앱에서는 표시용)
  serverNow: string; // ISO
}

export type VerifyResult =
  | { status: 'granted'; passExpiresAt: string }
  | { status: 'already_processed'; passExpiresAt: string | null }
  | { status: 'price_changed' } // 유예 밖 → 서버가 환불함
  | { status: 'invalid' }; // 미결제, 다른 계정, 모르는 상품

export interface PassPurchase {
  productId: string;
  purchaseToken: string;
}

export const PASS_PRODUCT_IDS = [
  'switchon_pass_5w_1900',
  'switchon_pass_5w_2900',
  'switchon_pass_5w_4900',
  'switchon_pass_1w_1500',
] as const;

// 상품별 패스 일수 (서버 _shared/pass.ts passProductOf와 같은 값)
export const WEEK_PASS_PRODUCT_ID = 'switchon_pass_1w_1500';
export const passDaysOf = (productId: string) => (productId === WEEK_PASS_PRODUCT_ID ? 7 : 35);

export const REGULAR_PRICE_KRW = 4900;
