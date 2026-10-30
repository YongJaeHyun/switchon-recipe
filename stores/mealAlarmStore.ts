import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_MEAL_MINUTES,
  normalizeMealTimes,
  type MealKey,
  type MealTimes,
} from 'utils/mealTimes';

// 끼니 알림 설정과 끼니 시각 (로컬, 서버에 보내지 않음).
// 끼니 시각은 단식(빠른 선택·숨기는 끼니)에도 쓰여서 알림을 꺼도 남는다
interface MealAlarmStore {
  on: boolean;
  times: MealTimes;
  setOn: (on: boolean) => void;
  setTime: (meal: MealKey, minutes: number) => void;
}

export const useMealAlarmStore = create<MealAlarmStore>()(
  persist(
    (set) => ({
      on: false,
      times: DEFAULT_MEAL_MINUTES,
      setOn: (on) => set({ on }),
      setTime: (meal, minutes) =>
        set((state) => ({ times: normalizeMealTimes({ ...state.times, [meal]: minutes }) })),
    }),
    {
      name: 'mealAlarmStore',
      version: 0,
      merge: (persisted: any, current) => ({
        ...current,
        on: persisted?.on === true,
        times: normalizeMealTimes(persisted?.times),
      }),
      partialize: (state) => ({ on: state.on, times: state.times }),
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
