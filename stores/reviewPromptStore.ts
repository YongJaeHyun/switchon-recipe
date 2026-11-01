import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { canAskReview, kstDay, type ReviewTrigger } from 'utils/reviewPrompt';
import { useRecipeJobStore } from './recipeJobStore';
import { useWeekCompletePopupStore } from './weekCompletePopupStore';

// 앱 리뷰 묻기 상태 (판단은 utils/reviewPrompt). 마지막으로 물은 시각·처음 쓴 날은 기기에 남기고,
// 이번 실행에서 물었는지·실패를 겪었는지·지금 떠 있는 창은 실행마다 새로
interface ReviewPromptStore {
  lastAskedAt: string | null;
  firstSeenDay: string | null;
  askedThisSession: boolean;
  failedThisSession: boolean;
  // 떠 있는 창의 계기 (null이면 닫힘)
  trigger: ReviewTrigger | null;

  // 좋은 순간에 부른다. 지금 물어도 되면 창을 띄우고 물은 것으로 기록 (닫기만 해도 30일 쉼)
  request(trigger: ReviewTrigger): boolean;
  close(): void;
  // 한도 초과·결제 오류 등: 이번 실행에서는 묻지 않는다
  markFailure(): void;
  ensureFirstSeen(): void;
}

export const useReviewPromptStore = create<ReviewPromptStore>()(
  persist(
    (set, get) => ({
      lastAskedAt: null,
      firstSeenDay: null,
      askedThisSession: false,
      failedThisSession: false,
      trigger: null,

      request: (trigger) => {
        const state = get();
        const popup = useWeekCompletePopupStore.getState();
        const now = new Date();
        const ok = canAskReview({
          now,
          lastAskedAt: state.lastAskedAt,
          askedThisSession: state.askedThisSession,
          failedThisSession: state.failedThisSession,
          firstSeenDay: state.firstSeenDay,
          programWeek: popup.week,
          programDay: popup.day,
          jobPhase: useRecipeJobStore.getState().job.phase,
          otherModalOpen: popup.visible || state.trigger !== null,
        });
        if (!ok) return false;
        set({ trigger, askedThisSession: true, lastAskedAt: now.toISOString() });
        return true;
      },
      close: () => set({ trigger: null }),
      markFailure: () => set({ failedThisSession: true }),
      ensureFirstSeen: () => {
        if (!get().firstSeenDay) set({ firstSeenDay: kstDay(new Date()) });
      },
    }),
    {
      name: 'reviewPromptStore',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastAskedAt: state.lastAskedAt, firstSeenDay: state.firstSeenDay }),
      // 처음 깔았거나 이 기능이 생긴 뒤 처음 연 날을 '처음 쓴 날'로 남긴다 (그날은 묻지 않는다)
      onRehydrateStorage: () => (state) => state?.ensureFirstSeen(),
    }
  )
);

// 레시피 만들기가 실패·한도 초과·거절·잠김으로 끝난 실행에서는 묻지 않는다
const FAILED_JOB_PHASES = ['error', 'quota', 'rejected', 'locked'];
useRecipeJobStore.subscribe((state) => {
  if (FAILED_JOB_PHASES.includes(state.job.phase)) useReviewPromptStore.getState().markFailure();
});

// 화면이 자리 잡은 뒤 묻기: delayMs 뒤에 다시 판단한다. 돌려준 함수로 취소 (화면을 떠나면)
export function requestReviewLater(trigger: ReviewTrigger, delayMs: number): () => void {
  const timer = setTimeout(() => useReviewPromptStore.getState().request(trigger), delayMs);
  return () => clearTimeout(timer);
}
