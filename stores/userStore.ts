import { UserDB } from 'types/database';
import { create } from 'zustand';

interface UserState extends UserDB {
  setUser: (user: UserDB) => Promise<void>;
  resetUser: () => Promise<void>;
}

export const useUserStore = create<UserState>()((set) => ({
  id: '',
  email: '',
  provider: '',
  created_at: '',
  start_date: '',
  program_start: null,
  avatar_url: null,
  is_onboarded: false,
  push_token: '',
  setUser: (user) =>
    new Promise((resolve) => {
      // 구버전 캐시·마이그레이션 전 행에는 program_start가 없다 (없으면 start_date로 본다: programStartOf)
      set({ ...user, program_start: user.program_start ?? null });
      resolve();
    }),
  resetUser: () =>
    new Promise<void>((resolve) => {
      set({
        id: '',
        email: '',
        provider: '',
        created_at: '',
        start_date: '',
        program_start: null,
        avatar_url: null,
        is_onboarded: false,
      });
      resolve();
    }),
}));
