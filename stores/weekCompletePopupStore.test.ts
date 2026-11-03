import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

const { useWeekCompletePopupStore } = await import('./weekCompletePopupStore');

describe('weekCompletePopupStore 한 주 더 하기 물은 키', () => {
  beforeEach(() => useWeekCompletePopupStore.setState({ repeatAskedKeys: [] }));

  it('처음엔 비어 있고, markRepeatAsked로 키를 한 번만 남긴다', () => {
    expect(useWeekCompletePopupStore.getState().repeatAskedKeys).toEqual([]);
    useWeekCompletePopupStore.getState().markRepeatAsked('2026-10-01:4');
    useWeekCompletePopupStore.getState().markRepeatAsked('2026-10-01:4');
    expect(useWeekCompletePopupStore.getState().repeatAskedKeys).toEqual(['2026-10-01:4']);
  });

  it('주차가 바뀌거나 팝업을 닫아도 물은 키는 남는다', () => {
    const s = useWeekCompletePopupStore.getState();
    s.markRepeatAsked('2026-10-01:4');
    s.setWeek(3);
    s.close();
    expect(useWeekCompletePopupStore.getState().repeatAskedKeys).toEqual(['2026-10-01:4']);
  });
});

describe('weekCompletePopupStore 계정별 지난 주차·일차', () => {
  beforeEach(() => useWeekCompletePopupStore.setState({ dayByUid: {}, week: 1, day: 1 }));

  it('처음엔 비어 있고, rememberDay는 계정마다 따로 남기며 전역 week·day는 건드리지 않는다', () => {
    const s = useWeekCompletePopupStore.getState();
    expect(s.dayByUid).toEqual({});
    s.rememberDay('a', { week: 2, day: 3 });
    s.rememberDay('b', { week: 1, day: 6 });
    const after = useWeekCompletePopupStore.getState();
    expect(after.dayByUid).toEqual({ a: { week: 2, day: 3 }, b: { week: 1, day: 6 } });
    expect(after.week).toBe(1);
    expect(after.day).toBe(1);
  });
});

describe('weekCompletePopupStore 예전 버전에서 올라온 값', () => {
  it('예전 버전(v0)이 남긴 week·day는 실제 값으로 표시한다', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    useWeekCompletePopupStore.setState({ globalDayKnown: false, dayByUid: {} });
    await AsyncStorage.setItem(
      'weekCompletePopupStore',
      JSON.stringify({ state: { week: 2, day: 4, isChecked: true }, version: 0 })
    );
    await useWeekCompletePopupStore.persist.rehydrate();
    const s = useWeekCompletePopupStore.getState();
    expect(s.globalDayKnown).toBe(true);
    expect(s.week).toBe(2);
    expect(s.day).toBe(4);
    expect(s.dayByUid).toEqual({});
  });

  it('새로 깐 앱은 기본값이라 실제 값으로 보지 않는다', () => {
    expect(useWeekCompletePopupStore.getInitialState?.().globalDayKnown ?? false).toBe(false);
  });
});
