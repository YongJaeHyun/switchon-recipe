import AsyncStorage from '@react-native-async-storage/async-storage';
import { selectRecentRecipeFromDB, selectSavedRecipeFromDB } from 'api/supabaseAPI';
import { RecipeDB } from 'types/database';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  savedRecipes: RecipeDB[];
  fetchSavedRecipes: () => Promise<void>;
  recentRecipes: RecipeDB[];
  fetchRecentRecipes: () => Promise<void>;
}

export const useRecipeStore = create<UserState>()(
  persist(
    (set) => ({
      savedRecipes: [],
      fetchSavedRecipes: async () => {
        const recipes = await selectSavedRecipeFromDB();
        set({ savedRecipes: recipes });
      },
      recentRecipes: [],
      fetchRecentRecipes: async () => {
        const recipes = await selectRecentRecipeFromDB();
        set({ recentRecipes: recipes });
      },
    }),
    {
      name: 'recipeStore',
      storage: {
        getItem: async (name: string) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name: string, value: any) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name: string) => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);
