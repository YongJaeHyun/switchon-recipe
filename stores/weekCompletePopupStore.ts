import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WeekCompletePopupStore {
  visible: boolean;
  week: number;
  isChecked: boolean;

  setWeek: (week: number) => void;
  open: () => void;
  close: () => void;
}

const initialValue = {
  visible: false,
  week: 1,
  isChecked: false,
};

export const useWeekCompletePopupStore = create<WeekCompletePopupStore>()(
  persist(
    (set) => ({
      ...initialValue,
      setWeek: (week) => set({ week, isChecked: false }),
      open: () => set({ visible: true }),
      close: () => set({ visible: false, isChecked: true }),
    }),
    {
      name: 'weekCompletePopupStore',
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
