import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 기록 탭 체중 칸 정체기 안내 카드의 로컬 상태 (서버에 보내지 않음)
interface WeightPlateauStore {
  // 카드를 닫은 날 (yyyy-MM-dd, KST). 그날만 숨김 (utils/weightPlateau isPlateauDismissed)
  dismissedDay: string | null;
  dismiss: (day: string) => void;
}

export const useWeightPlateauStore = create<WeightPlateauStore>()(
  persist(
    (set) => ({
      dismissedDay: null,
      dismiss: (day) => set({ dismissedDay: day }),
    }),
    {
      name: 'weightPlateauStore',
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
