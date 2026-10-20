// 편의점 판정 화면 문구. 화면 컴포넌트는 이 결과를 보여주기만 한다
import type { FoodCheckBasis, FoodCheckVerdict, PremiumQuotaStatus } from 'types/foodCheck';

// 서버 supabase/functions/_shared/premiumQuota.ts와 같은 문구 (429 토스트, 남은 횟수 0)
export const PREMIUM_QUOTA_EXCEEDED_MESSAGE = '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요';

export function verdictLabel(verdict: FoodCheckVerdict | null): string {
  if (verdict === 'ok') return '괜찮아요';
  if (verdict === 'avoid') return '피하세요';
  return '';
}

export function basisLabel(basis: FoodCheckBasis | null): string {
  if (basis === 'estimate') return '추정';
  if (basis === 'label') return '성분표 기준';
  return '';
}

export function formatPremiumRemaining({
  remaining,
  limit,
}: Pick<PremiumQuotaStatus, 'remaining' | 'limit'>): string {
  if (remaining <= 0) return PREMIUM_QUOTA_EXCEEDED_MESSAGE;
  return `오늘 판정 ${remaining}/${limit}회 남았어요`;
}
