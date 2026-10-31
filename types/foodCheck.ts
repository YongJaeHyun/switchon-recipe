// 음식 판정 (food-check 엣지 함수, food_check 테이블) 앱 쪽 타입.
// 서버 supabase/functions/food-check/handler.ts의 FoodCheckRecord와 같은 모양이다

// 'photo'가 지금 앱이 보내는 사진 한 장. 'front'·'label'은 옛 빌드가 남긴 기록에만 있다
export type FoodCheckInputType = 'photo' | 'front' | 'label' | 'text';
// 포장 상품인지 조리된 음식인지 (모델이 고른다). 옛 기록이거나 모르면 null
export type FoodKind = 'packaged' | 'dish';
export type FoodCheckVerdict = 'ok' | 'avoid';
export type FoodCheckBasis = 'estimate' | 'label';
export type FoodCheckMimeType = 'image/jpeg' | 'image/png';

export type FoodCheckInput =
  | { type: 'photo'; imageBase64: string; mimeType: FoodCheckMimeType }
  | { type: 'text'; text: string };

export interface FoodCheckRecord {
  id: number;
  uid: string;
  inputType: FoodCheckInputType;
  inputText: string | null;
  imagePath: string | null;
  thumbPath: string | null;
  productName: string | null;
  score: number | null;
  verdict: FoodCheckVerdict | null;
  basis: FoodCheckBasis | null;
  foodKind: FoodKind | null;
  reasons: string[] | null;
  alternatives: string[] | null;
  week: number | null;
  createdAt: string;
  // 썸네일 signed URL (1시간). 글자 입력이거나 썸네일이 없으면 null
  thumbUrl: string | null;
}

// food_check 테이블 행 (snake_case 그대로)
export interface FoodCheckRow {
  id: number;
  uid: string;
  input_type: string;
  input_text: string | null;
  image_path: string | null;
  thumb_path: string | null;
  product_name: string | null;
  score: number | null;
  verdict: string | null;
  basis: string | null;
  // 20261101010000_food_check_photo 마이그레이션 전 행에는 없다
  food_kind?: string | null;
  reasons: string[] | null;
  alternatives: string[] | null;
  week: number | null;
  created_at: string;
}

// FoodCheckAPI.check 결과. 네트워크/알 수 없는 오류는 토스트를 띄우고 undefined를 돌려준다
export type FoodCheckOutcome =
  // trialRemaining: 패스 없이 무료 체험으로 판정했을 때 남은 횟수 (패스 사용자는 없음)
  | { status: 'ok'; check: FoodCheckRecord; trialRemaining?: number }
  | { status: 'unrecognized'; message: string }
  // 402: 패스 없음
  | { status: 'locked' }
  // 429: 오늘 한도 소진
  | { status: 'quotaExceeded'; message: string }
  // 413: 본문(사진) 너무 큼
  | { status: 'tooLarge'; message: string }
  // 400: 입력 오류 (서버 문구)
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

// get_premium_quota(p_feature) rpc 응답
export interface PremiumQuotaStatus {
  used: number;
  limit: number;
  remaining: number;
}

export const FOOD_CHECK_FEATURE = 'food_check';
