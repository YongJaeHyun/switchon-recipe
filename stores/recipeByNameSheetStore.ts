import { create } from 'zustand';

export interface RecipeByNameOpenRequest {
  name: string;
  isZeroCarb: boolean;
  // 고른 주차 칸 (utils/recipeWeekChoice NAME_WEEK_CHOICES). 없으면 지금 주차
  weekChoice?: number;
  // 다시 열 때 이름 칸 아래에 보일 안내 (거절·한도 등)
  message?: string;
  // 연 화면 (완성 때 그 화면이면 바로 레시피로)
  origin: string;
  // 같은 값으로 다시 열어도 새로 열리게
  at: number;
}

// 먹고 싶은 음식으로 만들기 시트는 앱에 하나 (app/_layout). 입구와 하단 띠(이름 고치기)가 이 요청으로 연다
interface RecipeByNameSheetStore {
  request: RecipeByNameOpenRequest | null;
  open(request: Omit<RecipeByNameOpenRequest, 'at'>): void;
  // 로그아웃: 열린 시트를 닫고 요청을 지운다
  reset(): void;
}

export const useRecipeByNameSheetStore = create<RecipeByNameSheetStore>()((set) => ({
  request: null,
  open: (request) => set({ request: { ...request, at: Date.now() } }),
  reset: () => set({ request: null }),
}));
