import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addWeekRepeatAskedKey } from 'utils/weekRepeat';

interface WeekCompletePopupStore {
  visible: boolean;
  week: number;
  day: number;
  isChecked: boolean;
  isHydrated: boolean;
  // "한 주 더 하기"를 이미 물은 전환 (utils/weekRepeat weekRepeatKey: 시작일 + 진입 주차)
  repeatAskedKeys: string[];

  setWeek: (week: number) => void;
  setDay: (day: number) => void;
  setHydrated: (isHydrated: boolean) => void;
  open: () => void;
  close: () => void;
  markRepeatAsked: (key: string) => void;
}

const initialValue = {
  visible: false,
  week: 1,
  day: 1,
  isChecked: false,
  isHydrated: false,
  repeatAskedKeys: [] as string[],
};

export const useWeekCompletePopupStore = create<WeekCompletePopupStore>()(
  persist(
    (set) => ({
      ...initialValue,
      setWeek: (week) => set({ week, isChecked: false }),
      setDay: (day) => set({ day }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      open: () => set({ visible: true }),
      close: () => set({ visible: false, isChecked: true }),
      markRepeatAsked: (key) =>
        set((state) => ({ repeatAskedKeys: addWeekRepeatAskedKey(state.repeatAskedKeys, key) })),
    }),
    {
      name: 'weekCompletePopupStore',
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated(true);
      },
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
