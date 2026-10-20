// Google이 제공하는 테스트 보상형 광고 단위 ID
const TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

// 운영 보상형 광고 단위 ID ("레시피 추가 보상"). null로 바꾸면 운영에서 광고를 끈다.
// 서버 허용 목록(Supabase secret ADMOB_REWARDED_AD_UNIT_IDS)에는 '/' 뒤 숫자(4455068481)가 들어 있다.
const PRODUCTION_REWARDED_AD_UNIT_ID: string | null = 'ca-app-pub-3149926343798483/4455068481';

export const REWARDED_AD_UNIT_ID: string | null = __DEV__
  ? TEST_REWARDED_AD_UNIT_ID
  : PRODUCTION_REWARDED_AD_UNIT_ID;
