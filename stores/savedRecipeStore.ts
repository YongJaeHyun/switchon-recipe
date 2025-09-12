import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedRecipeFilter } from 'const/filter';
import { SavedRecipeSort } from 'const/sort';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SavedRecipeState {
  sort: SavedRecipeSort;
  setSort: (sort: SavedRecipeSort) => void;

  filter: SavedRecipeFilter;
  setFilter: (filter: SavedRecipeFilter) => void;
}

export const useSavedRecipeStore = create<SavedRecipeState>()(
  persist(
    (set) => ({
      sort: '최신순',
      setSort: (sort) => set({ sort }),

      filter: '전체',
      setFilter: (filter) => set({ filter }),
    }),
    {
      name: 'savedRecipeStore',
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
