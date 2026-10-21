import { RecipeAPI } from 'api/RecipeAPI';
import { RecipeWithIsSavedDB } from 'types/database';
import { create } from 'zustand';

interface RecipeState {
  isSavedMap: Record<number, boolean>;
  initIsSavedMap: (recipes: RecipeWithIsSavedDB[]) => void;
  // 다른 화면에서 받은 저장 여부를 덮어 쓴다 (맞춤 추천 응답의 is_saved 등). 나머지 항목은 그대로
  mergeIsSavedMap: (entries: Record<number, boolean>) => void;
  toggleIsSaved: (id: number) => void;
}

export const useRecipeStore = create<RecipeState>()((set, get) => ({
  isSavedMap: {},
  initIsSavedMap: (recipes) => {
    const map = Object.fromEntries(recipes.map((r) => [r.id, true]));
    set({ isSavedMap: map });
  },
  mergeIsSavedMap: (entries) => set({ isSavedMap: { ...get().isSavedMap, ...entries } }),
  toggleIsSaved: (id) => {
    const newMap = { ...get().isSavedMap };
    if (newMap[id]) {
      newMap[id] = false;
      RecipeAPI.deleteSaved(id);
    } else {
      newMap[id] = true;
      RecipeAPI.insertSaved(id);
    }
    set({ isSavedMap: newMap });
  },
}));
