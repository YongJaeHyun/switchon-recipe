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

// supabase.from('user').update(...).eq(...).select().single() → 서버가 돌려준 행
let serverRow: Record<string, unknown> = {};
const update = vi.fn();
vi.mock('lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        update(values);
        serverRow = { ...serverRow, ...values };
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { ...serverRow }, error: null }) }),
          }),
        };
      },
    }),
  },
}));
vi.mock('utils/sendError', () => ({ sendError: (fn: () => unknown) => fn() }));
vi.mock('utils/showToast', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock('utils/network', () => ({ isOnline: async () => true }));

const { UserAPI } = await import('./UserAPI');
const { useUserStore } = await import('stores/userStore');
const { loadCachedUser, saveCachedUser } = await import('utils/userCache');

const BASE = {
  id: 'u1',
  email: 'a@b.c',
  provider: 'kakao',
  created_at: '2026-09-01',
  start_date: '2026-10-01',
  program_start: '2026-10-01',
  avatar_url: null,
  is_onboarded: true,
  push_token: '',
};

// 오프라인으로 앱을 켜면 캐시를 쓰므로, 서버에 저장한 사용자 정보는 캐시에도 바로 남아야 한다
describe('UserAPI 저장 후 오프라인 캐시 갱신', () => {
  beforeEach(async () => {
    update.mockReset();
    serverRow = { ...BASE };
    await useUserStore.getState().setUser({ ...BASE });
    await saveCachedUser({ ...BASE, start_date: 'stale' });
  });

  it('updateStartDate 뒤 캐시에 새 시작일·회차 시작일', async () => {
    expect(await UserAPI.updateStartDate('2026-10-08', '2026-10-01')).toBe(true);
    const cached = await loadCachedUser();
    expect(cached?.start_date).toBe('2026-10-08');
    expect(cached?.program_start).toBe('2026-10-01');
  });

  it('updateOnboarding 뒤 캐시에 온보딩 완료·시작일', async () => {
    serverRow = { ...BASE, is_onboarded: false, start_date: '', program_start: null };
    await useUserStore.getState().setUser(serverRow as typeof BASE);
    expect(await UserAPI.updateOnboarding('2026-10-20')).toBe(true);
    const cached = await loadCachedUser();
    expect(cached?.is_onboarded).toBe(true);
    expect(cached?.start_date).toBe('2026-10-20');
    expect(cached?.program_start).toBe('2026-10-20');
  });

  it('updatePushToken 뒤 캐시에도 토큰', async () => {
    await UserAPI.updatePushToken('tok');
    expect((await loadCachedUser())?.push_token).toBe('tok');
  });
});

describe('userStore 캐시', () => {
  it('setUser는 id가 있는 사용자를 캐시에 남긴다', async () => {
    await useUserStore.getState().setUser({ ...BASE, start_date: '2026-11-01' });
    expect((await loadCachedUser())?.start_date).toBe('2026-11-01');
  });

  it('resetUser(로그아웃)는 캐시도 지운다', async () => {
    await useUserStore.getState().setUser({ ...BASE });
    await useUserStore.getState().resetUser();
    expect(await loadCachedUser()).toBeNull();
  });

  it('id 없는 사용자는 캐시에 쓰지 않는다', async () => {
    await useUserStore.getState().resetUser();
    await useUserStore.getState().setUser({ ...BASE, id: '' });
    expect(await loadCachedUser()).toBeNull();
  });
});
