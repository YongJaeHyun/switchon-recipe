// 서버 get_recipe_quota() rpc 응답과 같은 모양
export interface RecipeQuota {
  used: number;
  limit: number;
  remaining: number;
  adBonusLeft: number;
  isPass: boolean;
  // 광고 보상을 뺀 기본 하루 한도(무료 5, 패스 20). 이전 서버 응답에는 없어서 선택값
  dailyLimit?: number;
}

// create-recipe-by-gemini 429(QUOTA_EXCEEDED) 응답을 앱에서 다루는 모양
export interface QuotaExceeded {
  quotaExceeded: true;
  canWatchAd: boolean;
  isPass: boolean;
}

export const QUOTA_EXCEEDED_MESSAGE = '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.';

export const isQuotaExceeded = (result: unknown): result is QuotaExceeded =>
  typeof result === 'object' &&
  result !== null &&
  'quotaExceeded' in result &&
  result.quotaExceeded === true;
