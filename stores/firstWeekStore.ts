import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 시작 전 준비 체크리스트 항목
export type PrepItemId = 'shake' | 'rules' | 'groceries' | 'mealAlarm';

// 1주차 첫 경험용 로컬 상태 (서버에 보내지 않음)
interface FirstWeekStore {
  prepChecks: Partial<Record<PrepItemId, boolean>>;
  // 1주차 일별 안내 카드를 닫은 날 (yyyy-MM-dd, KST). 그날만 숨김
  guideDismissedDay: string | null;
  // 완주 축하 시트를 이미 보여준 날들 (yyyy-MM-dd, KST)
  celebratedDays: string[];

  togglePrep: (id: PrepItemId) => void;
  checkPrep: (id: PrepItemId) => void;
  dismissGuide: (day: string) => void;
  markCelebrated: (day: string) => void;
}

export const useFirstWeekStore = create<FirstWeekStore>()(
  persist(
    (set) => ({
      prepChecks: {},
      guideDismissedDay: null,
      celebratedDays: [],

      togglePrep: (id) =>
        set((state) => ({ prepChecks: { ...state.prepChecks, [id]: !state.prepChecks[id] } })),
      checkPrep: (id) => set((state) => ({ prepChecks: { ...state.prepChecks, [id]: true } })),
      dismissGuide: (day) => set({ guideDismissedDay: day }),
      markCelebrated: (day) =>
        set((state) =>
          state.celebratedDays.includes(day)
            ? state
            : { celebratedDays: [...state.celebratedDays, day].slice(-14) }
        ),
    }),
    {
      name: 'firstWeekStore',
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
