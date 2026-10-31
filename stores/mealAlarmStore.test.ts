import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MEAL_MINUTES } from 'utils/mealTimes';

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

const { useMealAlarmStore } = await import('./mealAlarmStore');

describe('mealAlarmStore 계정 바뀔 때 초기화 (로그아웃·탈퇴)', () => {
  it('reset은 끼니 알림을 끄고 끼니 시각을 기본값으로 되돌린다', () => {
    const s = useMealAlarmStore.getState();
    s.setOn(true);
    s.setTime('breakfast', 7 * 60);
    expect(useMealAlarmStore.getState().on).toBe(true);
    expect(useMealAlarmStore.getState().times).not.toEqual(DEFAULT_MEAL_MINUTES);

    useMealAlarmStore.getState().reset();

    expect(useMealAlarmStore.getState().on).toBe(false);
    expect(useMealAlarmStore.getState().times).toEqual(DEFAULT_MEAL_MINUTES);
  });
});
