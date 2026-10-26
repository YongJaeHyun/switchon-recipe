// 편의점 판정 (food-check 엣지 함수, food_check 테이블) 앱 쪽 타입.
// 서버 supabase/functions/food-check/handler.ts의 FoodCheckRecord와 같은 모양이다

export type FoodCheckInputType = 'front' | 'label' | 'text';
export type FoodCheckPhotoType = Exclude<FoodCheckInputType, 'text'>;
export type FoodCheckVerdict = 'ok' | 'avoid';
export type FoodCheckBasis = 'estimate' | 'label';
export type FoodCheckMimeType = 'image/jpeg' | 'image/png';

export type FoodCheckInput =
  | { type: FoodCheckPhotoType; imageBase64: string; mimeType: FoodCheckMimeType }
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
  reasons: string[] | null;
  alternatives: string[] | null;
  week: number | null;
  created_at: string;
}

// FoodCheckAPI.check 결과. 네트워크/알 수 없는 오류는 토스트를 띄우고 undefined를 돌려준다
export type FoodCheckOutcome =
  | { status: 'ok'; check: FoodCheckRecord }
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
