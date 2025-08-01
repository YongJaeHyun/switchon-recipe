import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecipeDB } from 'types/database';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  savedRecipes: RecipeDB[];
  setSavedRecipes: (recipes: RecipeDB[]) => void;
  recentRecipes: RecipeDB[];
  setRecentRecipes: (recipes: RecipeDB[]) => void;
}

export const useRecipeStore = create<UserState>()(
  persist(
    (set) => ({
      savedRecipes: [],
      setSavedRecipes: (recipes) => {
        set({ savedRecipes: recipes });
      },

      recentRecipes: [],
      setRecentRecipes: (recipes) => {
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
