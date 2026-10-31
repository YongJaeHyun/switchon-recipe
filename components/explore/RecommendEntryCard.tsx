import { ToolCard } from 'components/recipes/RecipeToolCards';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { useUserStore } from 'stores/userStore';
import { RECOMMEND_LOCKED_MESSAGE } from 'types/recommend';
import { getWeekAndDay } from 'utils/date';
import { passBadgeState } from 'utils/passFeatureLabel';
import { shouldShowPremiumEntry } from 'utils/passScreen';
import { isRecommendLocked } from 'utils/recommendForm';

// 탐색 탭 맨 위(검색창 아래) 맞춤 레시피 추천 입구 (운영자 결정 2026-11-01: 레시피 탭에서 옮김).
// 다른 패스 기능과 같은 규칙: 판매도 권한도 없으면 숨기고, 권한이 없으면 누를 때 결제 화면으로 (usePremiumGate)
export function RecommendEntryCard() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const startDate = useUserStore((state) => state.start_date);

  if (!shouldShowPremiumEntry(status, billingAvailable)) return null;

  const { week, day } = getWeekAndDay(startDate);
  return (
    <ToolCard
      title="맞춤 레시피 추천"
      description={
        isRecommendLocked(week, day)
          ? RECOMMEND_LOCKED_MESSAGE
          : '먹고 싶은 걸 고르면 레시피를 골라 드려요'
      }
      icon="restaurant-menu"
      badge={passBadgeState(status?.hasAccess === true)}
      onPress={gate(() => router.push('/recommend'))}
    />
  );
}
