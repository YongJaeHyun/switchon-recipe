// 음식 판정 무료 체험(패스 없이 평생 3번) 표시용 순수 함수. 서버(food-check)가 최종 판단하고,
// 남은 횟수는 get-pass-status의 foodCheckTrialRemaining을 참고만 한다
import type { PassStatus } from 'types/pass';
import { isPassOnSale } from './passScreen';
import { type TrialEntryState, trialEntryState, trialRemainingOf } from './passTrial';

// 서버 _shared/foodCheckTrial.ts FOOD_CHECK_TRIAL_LIMIT과 같은 값
export const FOOD_CHECK_TRIAL_LIMIT = 3;

// 패스 없이 남은 무료 판정 횟수. 패스가 있거나 상태를 모르거나 옛 서버(필드 없음)면 0
export function getFoodCheckTrialRemaining(status: PassStatus | undefined): number {
  return trialRemainingOf(status, status?.foodCheckTrialRemaining);
}

export type FoodCheckEntryState = TrialEntryState;

// 음식 판정 진입점 상태. 무료 체험은 판매가 꺼져 있어도 그대로 쓸 수 있다
export function foodCheckEntryState(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined
): FoodCheckEntryState {
  return trialEntryState(status, billingAvailable, status?.foodCheckTrialRemaining);
}

export function formatFoodCheckTrial(remaining: number): string {
  if (remaining <= 0) return `무료 체험 ${FOOD_CHECK_TRIAL_LIMIT}번을 모두 썼어요`;
  return `무료 체험 ${remaining}번 남았어요`;
}

// 무료 체험을 다 썼는데 패스를 살 수도 없으면 보내 봐야 402뿐이라 입력을 막는다.
// 상태를 모르거나 옛 서버(필드 없음)면 막지 않고 서버 판단에 맡긴다
export function isFoodCheckInputBlocked(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined
): boolean {
  if (!status || status.hasAccess || status.foodCheckTrialRemaining === undefined) return false;
  return getFoodCheckTrialRemaining(status) <= 0 && !isPassOnSale(status.sales, billingAvailable);
}
