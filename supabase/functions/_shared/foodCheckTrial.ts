// 편의점 판정 무료 체험 (패스 없이 사용자당 평생 3번). 기록은 user_trial.food_check_used,
// 차감·되돌림은 consume_food_check_trial / release_food_check_trial rpc (서버 최종 판단).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export const FOOD_CHECK_TRIAL_LIMIT = 3;

// consume_food_check_trial 응답: 쓴 뒤 남은 횟수(0 이상), 다 썼으면 -1.
// 모양이 어긋나면 허용/402로 새지 않도록 던져서 500으로 처리되게 한다.
export function parseTrialConsume(data: unknown): number {
  if (typeof data !== 'number' || !Number.isInteger(data) || data < -1) {
    throw new Error('무료 체험 응답 형식이 올바르지 않습니다');
  }
  return data;
}

// user_trial.food_check_used(행이 없으면 null) → 남은 무료 횟수
export function foodCheckTrialRemaining(used: number | null | undefined): number {
  return Math.max(FOOD_CHECK_TRIAL_LIMIT - (used ?? 0), 0);
}
