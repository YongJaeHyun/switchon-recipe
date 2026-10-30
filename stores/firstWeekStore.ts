import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { markCelebratedDay } from 'utils/dailyReminder';
import {
  EMPTY_PREP,
  prepChecksFor,
  setPrepCheck,
  type PrepItemId,
  type PrepState,
} from 'utils/prepChecks';

// 시작 전 준비 체크리스트 항목
export type { PrepItemId } from 'utils/prepChecks';

// 1주차 첫 경험용 로컬 상태 (서버에 보내지 않음)
interface FirstWeekStore {
  // 시작 전 준비 체크. 시작일에 묶여 있어 시작일이 바뀌면 비어 보인다 (utils/prepChecks)
  prep: PrepState;
  // 1주차 일별 안내 카드를 닫은 날 (yyyy-MM-dd, KST). 그날만 숨김
  guideDismissedDay: string | null;
  // 완주 축하 시트를 이미 보여준 날들 (yyyy-MM-dd, KST)
  celebratedDays: string[];

  togglePrep: (startDate: string | null, id: PrepItemId) => void;
  checkPrep: (startDate: string | null, id: PrepItemId) => void;
  dismissGuide: (day: string) => void;
  markCelebrated: (day: string) => void;
}

export const useFirstWeekStore = create<FirstWeekStore>()(
  persist(
    (set) => ({
      prep: EMPTY_PREP,
      guideDismissedDay: null,
      celebratedDays: [],

      togglePrep: (startDate, id) =>
        set((state) => ({
          prep: setPrepCheck(state.prep, startDate, id, !prepChecksFor(state.prep, startDate)[id]),
        })),
      checkPrep: (startDate, id) =>
        set((state) => ({ prep: setPrepCheck(state.prep, startDate, id, true) })),
      dismissGuide: (day) => set({ guideDismissedDay: day }),
      markCelebrated: (day) =>
        set((state) => ({ celebratedDays: markCelebratedDay(state.celebratedDays, day) })),
    }),
    {
      name: 'firstWeekStore',
      // v1: prepChecks(시작일 없음) → prep(시작일에 묶음). 예전 체크는 어느 시작일 것인지 몰라 버린다
      version: 1,
      migrate: (persisted: any) => {
        const { prepChecks: _legacy, ...rest } = persisted ?? {};
        return { ...rest, prep: EMPTY_PREP };
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
