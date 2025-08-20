import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecipeCategory, RecipeMethod, RecipeOptions } from 'types/recipe';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecipeOptionStore extends RecipeOptions {
  setCategory: (category: RecipeCategory) => void;
  setMethod: (method: RecipeMethod) => void;
}

const initialValue = {
  category: null,
  method: null,
};

export const useRecipeOptionStore = create<RecipeOptionStore>()(
  persist(
    (set) => ({
      ...initialValue,
      setCategory: (category) => set({ category }),
      setMethod: (method) => set({ method }),
    }),
    {
      name: 'recipeOptionStore',
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
