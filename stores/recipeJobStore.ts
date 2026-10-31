import { create } from 'zustand';
import {
  dismissRecipeJob,
  finishRecipeJob,
  initialRecipeJobState,
  isRecipeJobBusy,
  resetRecipeJob,
  type RecipeJobResult,
  type RecipeJobState,
  startRecipeJob,
} from 'utils/recipeJob';

// 뒤에서 도는 레시피 만들기 한 건 (전이는 utils/recipeJob). 요청은 services/recipeJobRunner가 보낸다
interface RecipeJobStore extends RecipeJobState {
  // 지금 보고 있는(포커스된) 시작 화면들: 완성 때 그 화면이면 띠 대신 바로 레시피를 연다
  focusedOrigins: string[];
  // 한도 초과 뒤 광고 보상을 기다리는 중 (이때도 [만들기]는 막는다)
  waitingBonus: boolean;
  // 띠 높이(재어 둠): 아래 버튼이 있는 화면이 그만큼 비워 둔다 (RecipeJobBandSpacer)
  bandHeight: number;
  // 한도 창에서 광고를 보면 다시 보낼 요청 (services/recipeJobRunner SavedRecipeJob). 로그아웃하면 지운다
  retryJob: unknown;

  start(job: { label: string; origin: string; input: unknown }): number | null;
  finish(id: number, result: RecipeJobResult): void;
  dismiss(): void;
  focusOrigin(origin: string): void;
  blurOrigin(origin: string): void;
  setWaitingBonus(waiting: boolean): void;
  setBandHeight(height: number): void;
  setRetryJob(job: unknown): void;
  // 로그아웃·계정 바뀜: 띠·다시 보낼 요청·광고 대기를 모두 비운다
  reset(): void;
}

export const useRecipeJobStore = create<RecipeJobStore>()((set, get) => ({
  ...initialRecipeJobState,
  focusedOrigins: [],
  waitingBonus: false,
  bandHeight: 0,
  retryJob: null,

  start: (job) => {
    const started = startRecipeJob(get(), job);
    if (!started) return null;
    set(started.state);
    return started.id;
  },
  finish: (id, result) => set((state) => finishRecipeJob(state, id, result)),
  dismiss: () => set((state) => dismissRecipeJob(state)),
  focusOrigin: (origin) =>
    set((state) =>
      state.focusedOrigins.includes(origin)
        ? state
        : { focusedOrigins: [...state.focusedOrigins, origin] }
    ),
  blurOrigin: (origin) =>
    set((state) => ({ focusedOrigins: state.focusedOrigins.filter((o) => o !== origin) })),
  setWaitingBonus: (waitingBonus) => set({ waitingBonus }),
  setBandHeight: (bandHeight) => set({ bandHeight }),
  setRetryJob: (retryJob) => set({ retryJob }),
  reset: () => set((state) => ({ ...resetRecipeJob(state), retryJob: null, waitingBonus: false })),
}));

// 만들기 버튼을 막을지 ("만드는 중…")
export const useRecipeJobBusy = () =>
  useRecipeJobStore((state) => isRecipeJobBusy(state) || state.waitingBonus);
