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
