import type { QuotaExceeded, RecipeQuota } from 'types/recipeQuota';

const PASS_REMAINING_NOTICE_THRESHOLD = 5;
// 이번 패스로 만들 수 있는 레시피가 이만큼 이하로 남으면 알려준다
const PASS_TOTAL_NOTICE_THRESHOLD = 20;

// 무료: 기본 하루 개수와 남은 개수를 항상 표시, 패스: 남은 개수가 적을 때만 표시.
// 최대 개수는 광고 보상과 상관없이 기본 한도(dailyLimit)로 고정한다
// 패스는 이번 패스 총량이 20개 이하로 남았고 오늘 남은 수보다 적거나 같으면 총량을 보여준다
export const formatRemaining = (
  q: Pick<RecipeQuota, 'isPass' | 'remaining' | 'limit' | 'dailyLimit' | 'passTotalRemaining'>
): string | null => {
  const max = q.dailyLimit ?? q.limit;
  if (q.remaining <= 0) {
    return `오늘 ${q.isPass ? '' : '무료 '}레시피를 모두 만들었어요 · 자정에 다시 채워져요`;
  }
  if (q.isPass) {
    const total = q.passTotalRemaining;
    if (typeof total === 'number' && total <= PASS_TOTAL_NOTICE_THRESHOLD && total <= q.remaining) {
      return `이번 패스로 ${total}개 더 만들 수 있어요`;
    }
    if (q.remaining > PASS_REMAINING_NOTICE_THRESHOLD) return null;
    return `오늘 ${q.remaining}/${max}개 남았어요`;
  }
  return `오늘 무료 레시피 ${q.remaining}/${max}개 남았어요`;
};

// 무료 이용자에게 오늘 남은 광고 보상 횟수 (패스·광고 불가 앱·소진 시 숨김)
export const formatAdBonusLeft = (
  q: Pick<RecipeQuota, 'isPass' | 'adBonusLeft'>,
  adsAvailable: boolean
): string | null => {
  if (q.isPass || !adsAvailable || q.adBonusLeft <= 0) return null;
  return `광고 보고 ${q.adBonusLeft}개 더 만들 수 있어요`;
};

export type QuotaModalView = {
  headline: string;
  note: string | null;
  // 광고 보고 1개 더 만들기 버튼. hint는 버튼 아래 오늘 남은 광고 수
  ad: { hint: string | null } | null;
  // 패스 안내. lead는 하루 개수, features는 패스 기능 이름 (화면에서 "lead + 기능, 기능"으로 잇는다)
  pass: { lead: string; features: readonly string[] } | null;
};

const DONE_FOR_TODAY = { headline: '오늘은 여기까지예요', note: '내일 다시 만들 수 있어요' };

// 이번 패스 레시피 총량을 다 쓴 경우: 무료 이용자처럼 무료 하루 수와 광고로 이어서 만든다.
// 회차 중이므로 패스를 다시 사라는 안내는 하지 않는다
const passCapView = (input: {
  canWatchAd: boolean;
  adsAvailable: boolean;
  freeDaily: number | null;
  adBonusLeft: number | null;
  passTotalLimit?: number | null;
}): QuotaModalView => {
  const headline = input.passTotalLimit
    ? `이번 패스로 만들 수 있는 레시피 ${input.passTotalLimit}개를 모두 만들었어요`
    : '이번 패스로 만들 수 있는 레시피를 모두 만들었어요';
  const free = input.freeDaily ? `무료 레시피(하루 ${input.freeDaily}개)` : '무료 레시피';
  const ways = input.adsAvailable ? `${free}와 광고로` : `${free}로`;
  if (input.canWatchAd && input.adsAvailable) {
    return {
      headline,
      note: `이제 ${ways} 더 만들 수 있어요`,
      ad: {
        hint: input.adBonusLeft ? `오늘 광고로 ${input.adBonusLeft}개 더 만들 수 있어요` : null,
      },
      pass: null,
    };
  }
  return { headline, note: `내일부터 ${ways} 더 만들 수 있어요`, ad: null, pass: null };
};

// 한도 초과 모달에 보여줄 내용. 개수는 DB 설정(quota_setting)에서 온 값을 넘겨받고, 모르면 숫자를 뺀다
export const getQuotaModalView = (input: {
  isPass: boolean;
  canWatchAd: boolean;
  adsAvailable: boolean;
  onSale: boolean;
  freeDaily: number | null;
  adBonusLeft: number | null;
  passDaily: number | null;
  passFeatures: readonly string[];
  // 이번 패스 레시피 총량을 다 썼는지 (429 본문 passCapReached)와 그 총량
  passCapReached?: boolean;
  passTotalLimit?: number | null;
}): QuotaModalView => {
  if (input.passCapReached) return passCapView(input);
  if (input.isPass) return { ...DONE_FOR_TODAY, ad: null, pass: null };

  const pass = input.onSale
    ? {
        lead: input.passDaily ? `광고 없이 하루 ${input.passDaily}개` : '광고 없이 더 많은 레시피',
        features: input.passFeatures,
      }
    : null;

  if (!input.canWatchAd || !input.adsAvailable) return { ...DONE_FOR_TODAY, ad: null, pass };

  return {
    headline: input.freeDaily
      ? `오늘 무료 레시피 ${input.freeDaily}개를 다 썼어요`
      : '오늘 무료 레시피를 다 썼어요',
    note: null,
    ad: {
      hint: input.adBonusLeft ? `오늘 광고로 ${input.adBonusLeft}개 더 만들 수 있어요` : null,
    },
    pass,
  };
};

// create-recipe-by-gemini·create-recipe-by-name의 429 QUOTA_EXCEEDED 본문을 앱 모양으로.
// 패스 총량 필드는 서버가 보낸 경우에만 더한다
export const quotaExceededFromBody = (body: unknown): QuotaExceeded => {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  return {
    quotaExceeded: true,
    canWatchAd: b.canWatchAd === true,
    isPass: b.isPass === true,
    ...(b.passCapReached === true ? { passCapReached: true as const } : {}),
    ...(b.passCapReached === true && typeof b.passTotalLimit === 'number'
      ? { passTotalLimit: b.passTotalLimit }
      : {}),
  };
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
