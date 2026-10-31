import { UserDB } from 'types/database';
import { clearCachedUser, saveCachedUser } from 'utils/userCache';
import { create } from 'zustand';

interface UserState extends UserDB {
  setUser: (user: UserDB) => Promise<void>;
  resetUser: () => Promise<void>;
}

// 사용자 정보를 바꾸는 단 하나의 길. 로그인한 사용자(id 있음)면 오프라인 시작용 캐시도 같이 갱신하고,
// resetUser(로그아웃·세션 만료)는 캐시도 지운다
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
  setUser: async (user) => {
    // 구버전 캐시·마이그레이션 전 행에는 program_start가 없다 (없으면 start_date로 본다: programStartOf)
    set({ ...user, program_start: user.program_start ?? null });
    if (user.id) await saveCachedUser(user);
  },
  resetUser: async () => {
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
    await clearCachedUser();
  },
}));
