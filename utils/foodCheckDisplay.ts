// 편의점 판정 화면 문구. 화면 컴포넌트는 이 결과를 보여주기만 한다
import type { FoodCheckBasis, FoodCheckRecord, PremiumQuotaStatus } from 'types/foodCheck';

// 서버 supabase/functions/_shared/premiumQuota.ts와 같은 문구 (429 토스트, 남은 횟수 0)
export const PREMIUM_QUOTA_EXCEEDED_MESSAGE = '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요';

// 판정 세 단계 (점수 기준). 서버 verdict는 5점 기준 ok/avoid라 점수가 있으면 점수로 나눈다
export type FoodCheckLevel = 'ok' | 'caution' | 'avoid';

export function foodCheckLevel(
  check: Pick<FoodCheckRecord, 'score' | 'verdict'>
): FoodCheckLevel | null {
  if (check.score != null) {
    if (check.score >= 7) return 'ok';
    if (check.score >= 4) return 'caution';
    return 'avoid';
  }
  return check.verdict;
}

const LEVEL_LABEL: Record<FoodCheckLevel, string> = {
  ok: '먹어도 돼요',
  caution: '주의가 필요해요',
  avoid: '피하는 게 좋아요',
};

export function foodCheckLevelLabel(level: FoodCheckLevel | null): string {
  return level ? LEVEL_LABEL[level] : '';
}

// 단계별 글자색 (흰 바탕에서 읽히는 진한 색)
export const FOOD_CHECK_LEVEL_TEXT: Record<FoodCheckLevel, string> = {
  ok: 'text-green-600',
  caution: 'text-amber-600',
  avoid: 'text-red-500',
};

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
