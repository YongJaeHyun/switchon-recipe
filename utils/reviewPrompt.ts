// 앱 리뷰 묻기 (운영자 결정 2026-11-01). 좋은 순간에만, 30일에 한 번, 한 번 실행에 한 번.
// 여기는 순수 판단만: 상태 보관은 stores/reviewPromptStore, 창은 components/common/ReviewPromptModal
import type { RecipeJob } from './recipeJob';

export const REVIEW_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// 묻는 순간: 2주차 진입 팝업을 닫은 뒤 / 레시피를 3개째 저장.
// 주간 리포트(좋은 주)에서 묻기는 너무 이르고 쉽게 떠서 뺐다 (운영자 결정 2026-11-01)
export type ReviewTrigger = 'week2' | 'saved3';

export interface ReviewAskState {
  now: Date;
  // 마지막으로 물은 시각 (ISO). 닫기(✕·뒤로)도 물은 것으로 센다
  lastAskedAt: string | null;
  askedThisSession: boolean;
  // 이번 실행에서 실패를 겪었는지 (레시피 한도 초과·결제 오류 등)
  failedThisSession: boolean;
  // 이 기기에서 앱을 처음 쓴 KST 날짜. 모르면 null
  firstSeenDay: string | null;
  programWeek: number;
  programDay: number;
  jobPhase: RecipeJob['phase'];
  // 주차 팝업 등 다른 창이 떠 있는지
  otherModalOpen: boolean;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const kstDay = (date: Date) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 레시피 만들기가 도는 중이거나 실패·한도 띠가 남아 있으면 묻지 않는다 (완성 띠는 괜찮다)
const BLOCKING_JOB_PHASES: RecipeJob['phase'][] = [
  'running',
  'error',
  'quota',
  'rejected',
  'locked',
];

export function canAskReview(state: ReviewAskState): boolean {
  if (state.askedThisSession || state.failedThisSession || state.otherModalOpen) return false;
  if (BLOCKING_JOB_PHASES.includes(state.jobPhase)) return false;
  // 첫날: 앱을 처음 쓴 날, 또는 프로그램 1주차 1일
  if (!state.firstSeenDay || state.firstSeenDay === kstDay(state.now)) return false;
  if (state.programWeek <= 1 && state.programDay <= 1) return false;

  if (state.lastAskedAt) {
    const last = Date.parse(state.lastAskedAt);
    if (Number.isFinite(last) && state.now.getTime() - last < REVIEW_COOLDOWN_DAYS * DAY_MS) {
      return false;
    }
  }
  return true;
}

// 레시피 저장 직후: 이번 저장이 성공했고 그 결과 저장한 레시피가 딱 3개가 됐을 때만
export function shouldAskAfterSave({ saved, count }: { saved: boolean; count: number | null }) {
  return saved && count === 3;
}
