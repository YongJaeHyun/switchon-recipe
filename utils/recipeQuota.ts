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

export type AdBonusOutcome = 'closed' | 'delayed' | 'retried' | 'unmounted';

// 광고 시청 → 보상 확인 → 재시도 순서. 보상 확인 중에는 onWaiting(true)를 유지하고,
// 재시도 시작 전에는 풀지 않는다(보상 1개에 생성이 두 번 시작되는 틈을 막는다)
export const runAdBonusFlow = async (deps: {
  showAd: () => Promise<'earned' | 'closed'>;
  waitBonus: () => Promise<boolean>;
  retry: () => Promise<void>;
  isMounted: () => boolean;
  onWaiting: (waiting: boolean) => void;
}): Promise<AdBonusOutcome> => {
  if ((await deps.showAd()) !== 'earned') return 'closed';
  deps.onWaiting(true);
  const granted = await deps.waitBonus();
  if (!granted) return 'delayed';
  if (!deps.isMounted()) return 'unmounted';
  const retrying = deps.retry();
  deps.onWaiting(false);
  await retrying;
  return 'retried';
};
