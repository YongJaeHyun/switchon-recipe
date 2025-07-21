import AsyncStorage from '@react-native-async-storage/async-storage';
import { IIngredient } from 'types/recipe';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface IngredientState {
  selectedIngredients: IIngredient[];
  toggleIngredient: (ingredient: IIngredient) => void;
}

export const useIngredientStore = create<IngredientState>()(
  persist(
    (set, get) => ({
      selectedIngredients: [],
      toggleIngredient: (ingredient) => {
        const selected = get().selectedIngredients;
        const exists = selected.some((i) => i.name === ingredient.name);

        if (exists) {
          // 이름이 같은 재료 제거
          set({
            selectedIngredients: selected.filter((i) => i.name !== ingredient.name),
          });
        } else {
          // 이름이 같은 재료가 없을 때 추가
          set({
            selectedIngredients: [...selected, ingredient],
          });
        }
      },
    }),
    {
      name: 'ingredientStore',
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
