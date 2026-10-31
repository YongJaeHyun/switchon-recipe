// 서버 get_recipe_quota() rpc 응답과 같은 모양
export interface RecipeQuota {
  used: number;
  limit: number;
  remaining: number;
  adBonusLeft: number;
  isPass: boolean;
  // 광고 보상을 뺀 기본 하루 한도(무료 free_daily, 패스 pass_daily). 이전 서버 응답에는 없어서 선택값
  dailyLimit?: number;
  // 이번 패스 레시피 총량 (20261101050000 마이그레이션 뒤 응답에만 있음).
  // isPass는 "패스 한도로 세는지"라서 총량을 다 쓰면 false, hasPass는 패스가 있는지
  hasPass?: boolean;
  passCapReached?: boolean;
  passTotalLimit?: number | null;
  passTotalRemaining?: number | null;
}

// create-recipe-by-gemini 429(QUOTA_EXCEEDED) 응답을 앱에서 다루는 모양
export interface QuotaExceeded {
  quotaExceeded: true;
  canWatchAd: boolean;
  isPass: boolean;
  // 이번 패스 레시피 총량을 다 써서 무료처럼 센 경우만 true (그때만 있음)
  passCapReached?: true;
  passTotalLimit?: number;
}

export const QUOTA_EXCEEDED_MESSAGE = '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.';

export const isQuotaExceeded = (result: unknown): result is QuotaExceeded =>
  typeof result === 'object' &&
  result !== null &&
  'quotaExceeded' in result &&
  result.quotaExceeded === true;

// quota_setting 행(누구나 조회 가능). 숫자는 DB에서 바꾸므로 앱에 하드코딩하지 않는다
export interface RecipeQuotaSetting {
  freeDaily: number;
  passDaily: number;
  adBonusDaily: number;
}
