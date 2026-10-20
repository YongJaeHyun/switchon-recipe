import type { RecipeQuota } from 'types/recipeQuota';

const PASS_REMAINING_NOTICE_THRESHOLD = 5;

// 무료: 항상 표시, 패스: 남은 개수가 적을 때만 표시
export const formatRemaining = (q: Pick<RecipeQuota, 'isPass' | 'remaining'>): string | null => {
  if (q.isPass && q.remaining > PASS_REMAINING_NOTICE_THRESHOLD) return null;
  return `오늘 ${q.remaining}개 남았어요`;
};

export type QuotaModalAction = 'watchAd' | 'pass';

export const getQuotaModalActions = (input: {
  isPass: boolean;
  canWatchAd: boolean;
  onSale: boolean;
  adsAvailable: boolean;
}): QuotaModalAction[] => {
  if (input.isPass) return [];

  const actions: QuotaModalAction[] = [];
  if (input.canWatchAd && input.adsAvailable) actions.push('watchAd');
  if (input.onSale) actions.push('pass');
  return actions;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 광고 보상은 서버 SSV 콜백으로 비동기 반영되므로, remaining > 0이 될 때까지 조회를 반복한다
export const waitForAdBonus = async (
  get: () => Promise<{ remaining: number }>,
  opts: { tries?: number; intervalMs?: number } = {}
): Promise<boolean> => {
  const { tries = 5, intervalMs = 1500 } = opts;

  for (let i = 0; i < tries; i++) {
    try {
      if ((await get()).remaining > 0) return true;
    } catch {
      // 일시 오류는 다음 시도에서 다시 확인한다
    }
    if (i < tries - 1) await wait(intervalMs);
  }
  return false;
};
