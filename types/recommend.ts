// 맞춤 레시피 추천 타입. 서버 공용 모듈(supabase/functions/_shared/recommend.ts, recipeTags.ts)의
// 앱 쪽 복사본이다 (앱은 supabase/functions를 import하지 않는다). 어긋남은 utils/recommendForm.test.ts가 잡는다
import type { RecipeDB } from './database';

export type Meal = 'breakfast' | 'lunch' | 'dinner';
export type MealKind = 'shake' | 'low' | 'zero';
export type Cuisine = 'korean' | 'western' | 'chinese' | 'japanese' | 'other';
export type Method = 'stir_fry' | 'grill' | 'soup' | 'steam' | 'salad' | 'rice_bowl' | 'other';
export type MaxMinutes = 15 | 30;

export interface RecommendConditions {
  spicy?: boolean | null;
  cuisine?: Cuisine | null;
  method?: Method | null;
  maxMinutes?: MaxMinutes | null;
  meal?: Meal | null;
  mustInclude?: string[];
  exclude?: string[];
}

// recommend-recipes 요청 본문. mergeSaved: true면 서버가 exclude ∪ 저장된 목록을 쓴다
export interface RecommendRequest extends RecommendConditions {
  mergeSaved?: boolean;
}

export const SHAKE_MEAL_REASON = '이 끼니는 프로틴쉐이크예요';
// 스펙은 "2주차부터"지만 BASE_TODOS상 1주차 4일차부터 점심이 저탄수식이라 그때 열린다
export const RECOMMEND_LOCKED_MESSAGE = '1주차 4일차부터 쓸 수 있어요';

export interface MealOption {
  meal: Meal;
  enabled: boolean;
  reason?: typeof SHAKE_MEAL_REASON;
}

// recommend-recipes 응답 해석 결과
export type RecommendOutcome =
  | { status: 'ok'; recipes: RecipeDB[]; totalMatches: number }
  | { status: 'shake' }
  | { status: 'locked' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };
