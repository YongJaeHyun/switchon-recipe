import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 체중 목표의 로컬 기억 (서버에 보내지 않음)
interface WeightGoalStore {
  // 첫 기록 뒤 목표 묻기를 "나중에 정할게요"로 넘긴 사용자 id. 이 기기에서는 다시 자동으로 묻지 않는다
  skippedUids: string[];
  markSkipped: (uid: string) => void;
}

export const useWeightGoalStore = create<WeightGoalStore>()(
  persist(
    (set) => ({
      skippedUids: [],
      markSkipped: (uid) =>
        set((state) =>
          state.skippedUids.includes(uid) ? state : { skippedUids: [...state.skippedUids, uid] }
        ),
    }),
    {
      name: 'weightGoalStore',
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
