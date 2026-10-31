// 패스로 쓸 수 있는 양 (결제 화면 안내용, get-pass-status의 limits). 숫자는 앱에 박지 않고 서버가 내려준다:
// - 레시피: quota_setting (pass_daily 하루, pass_recipe_total 5주 패스 하나, pass_recipe_per_week 1주 패스·한 주 더 하기 한 번)
//   (총량 규칙은 migrations/20261101050000_pass_recipe_cap_and_ai_usage.sql pass_recipe_period)
// - 음식 판정·이름 확인 하루 한도: premium_quota_setting (food_check, recipe_name_check)
// - 인바디 결과지 하루 한도: 아래 상수 (read-inbody가 같은 값으로 차감한다)
// - 패스 일수: _shared/pass.ts
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

import { PASS_DAYS, WEEK_PASS_PRODUCT } from './pass.ts';

// 인바디 결과지 읽기 하루 횟수 (운영자 결정 2026-11-01: 10 → 3)
export const INBODY_DAILY_LIMIT = 3;

export interface PassLimits {
  recipeDaily: number;
  recipePerPass: number; // 5주 패스 하나
  recipePerWeek: number; // 1주 패스 하나, 한 주 더 하기 한 번
  nameCheckDaily: number;
  foodCheckDaily: number;
  inbodyDaily: number;
  fiveWeekDays: number;
  weekPassDays: number;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

// quotaRow: quota_setting id=1 행, premiumRows: premium_quota_setting 행들.
// 값 하나라도 모르면 null: 앱은 틀린 숫자 대신 안내를 숨긴다
export function buildPassLimits(
  quotaRow: Record<string, unknown> | null | undefined,
  premiumRows: { feature: unknown; daily: unknown }[] | null | undefined
): PassLimits | null {
  const daily = (feature: string) => premiumRows?.find((r) => r.feature === feature)?.daily;
  const limits = {
    recipeDaily: quotaRow?.pass_daily,
    recipePerPass: quotaRow?.pass_recipe_total,
    recipePerWeek: quotaRow?.pass_recipe_per_week,
    nameCheckDaily: daily('recipe_name_check'),
    foodCheckDaily: daily('food_check'),
    inbodyDaily: INBODY_DAILY_LIMIT,
    fiveWeekDays: PASS_DAYS,
    weekPassDays: WEEK_PASS_PRODUCT.days,
  };
  return Object.values(limits).every(isCount) ? (limits as PassLimits) : null;
}
