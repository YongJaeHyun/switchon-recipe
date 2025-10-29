import { RecipeAPI } from 'api/RecipeAPI';
import { RecipeDB } from 'types/database';
import { create } from 'zustand';

interface RecipeState {
  isSavedMap: Record<number, boolean>;
  initIsSavedMap: (recipes: RecipeDB[]) => void;
  toggleIsSaved: (id: number) => void;
}

export const useRecipeStore = create<RecipeState>()((set, get) => ({
  isSavedMap: {},
  initIsSavedMap: (recipes) => {
    const map = Object.fromEntries(recipes.map((r) => [r.id, true]));
    set({ isSavedMap: map });
  },
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
