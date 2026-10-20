// Google이 제공하는 테스트 보상형 광고 단위 ID
const TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

// 운영 보상형 광고 단위 ID. 아직 정해지지 않았다(운영자가 AdMob에서 발급 후 전달).
// null이면 운영에서는 광고를 비활성화한다.
const PRODUCTION_REWARDED_AD_UNIT_ID: string | null = null;

export const REWARDED_AD_UNIT_ID: string | null = __DEV__
  ? TEST_REWARDED_AD_UNIT_ID
  : PRODUCTION_REWARDED_AD_UNIT_ID;
