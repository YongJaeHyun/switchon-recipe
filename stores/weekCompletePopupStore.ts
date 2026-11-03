import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { rememberDay, type DayMark } from 'utils/dayState';
import { addWeekRepeatAskedKey } from 'utils/weekRepeat';

interface WeekCompletePopupStore {
  visible: boolean;
  week: number;
  day: number;
  isChecked: boolean;
  isHydrated: boolean;
  // "한 주 더 하기"를 이미 물은 전환 (utils/weekRepeat weekRepeatKey: 시작일 + 진입 주차)
  repeatAskedKeys: string[];
  // 본 주차 팝업 (utils/weekPopup weekPopupKey: 계정·시작일·주차). 기기 하나에 여러 계정이 들러도 다시 뜨지 않게
  seenWeekKeys: string[];
  // week·isChecked를 남긴 계정 (모르면 null: 이 기억을 넣기 전 버전에서 올라온 경우)
  ownerUid: string | null;
  // 지금 떠 있는 팝업의 키 (닫을 때 본 것으로 남긴다)
  popupKey: string | null;
  // 계정별 지난 주차·일차 (utils/dayState). week·day는 지금 계정 값으로 계속 맞추지만(화면 표시·리뷰 묻기),
  // "날이 바뀌었나"는 이 계정 기억으로 본다
  dayByUid: Record<string, DayMark>;
  // week·day가 예전 버전에서 남긴 값인지 (새로 깐 앱의 기본값이면 false). 계정별 기억이 비었을 때만 본다
  globalDayKnown: boolean;

  setWeek: (week: number) => void;
  setDay: (day: number) => void;
  setHydrated: (isHydrated: boolean) => void;
  open: () => void;
  close: () => void;
  markRepeatAsked: (key: string) => void;
  setOwner: (uid: string) => void;
  markWeekSeen: (key: string) => void;
  openWithKey: (key: string) => void;
  rememberDay: (uid: string, mark: DayMark) => void;
}

const initialValue = {
  visible: false,
  week: 1,
  day: 1,
  isChecked: false,
  isHydrated: false,
  repeatAskedKeys: [] as string[],
  seenWeekKeys: [] as string[],
  ownerUid: null as string | null,
  popupKey: null as string | null,
  dayByUid: {} as Record<string, DayMark>,
  globalDayKnown: false,
};

const SEEN_WEEK_KEYS_MAX = 50;
const addSeen = (keys: string[], key: string | null) =>
  !key || keys.includes(key) ? keys : [...keys, key].slice(-SEEN_WEEK_KEYS_MAX);

export const useWeekCompletePopupStore = create<WeekCompletePopupStore>()(
  persist(
    (set) => ({
      ...initialValue,
      setWeek: (week) => set({ week, isChecked: false }),
      setDay: (day) => set({ day }),
      setHydrated: (isHydrated) => set({ isHydrated }),
      open: () => set({ visible: true }),
      close: () =>
        set((state) => ({
          visible: false,
          isChecked: true,
          seenWeekKeys: addSeen(state.seenWeekKeys, state.popupKey),
          popupKey: null,
        })),
      setOwner: (uid) => set({ ownerUid: uid }),
      markWeekSeen: (key) => set((state) => ({ seenWeekKeys: addSeen(state.seenWeekKeys, key) })),
      openWithKey: (key) => set({ visible: true, popupKey: key }),
      rememberDay: (uid, mark) =>
        set((state) => {
          const dayByUid = rememberDay(state.dayByUid, uid, mark);
          return dayByUid === state.dayByUid ? state : { dayByUid };
        }),
      markRepeatAsked: (key) =>
        set((state) => ({ repeatAskedKeys: addWeekRepeatAskedKey(state.repeatAskedKeys, key) })),
    }),
    {
      name: 'weekCompletePopupStore',
      // v1: 계정별 지난 주차·일차(dayByUid). 예전 버전에서 올라오면 week·day는 실제로 남긴 값이다
      version: 1,
      migrate: (persisted: any, version) =>
        version < 1 ? { ...(persisted ?? {}), globalDayKnown: true } : persisted,
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
