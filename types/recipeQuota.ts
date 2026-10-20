// 서버 get_recipe_quota() rpc 응답과 같은 모양
export interface RecipeQuota {
  used: number;
  limit: number;
  remaining: number;
  adBonusLeft: number;
  isPass: boolean;
}

// create-recipe-by-gemini 429(QUOTA_EXCEEDED) 응답을 앱에서 다루는 모양
export interface QuotaExceeded {
  quotaExceeded: true;
  canWatchAd: boolean;
  isPass: boolean;
}
