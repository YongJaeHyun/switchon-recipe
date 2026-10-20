import { UserDB } from 'types/database';

interface StartupDeps {
  isOnline: () => Promise<boolean>;
  loadSessionUser: () => Promise<{ hasSession: boolean; user: UserDB | null }>;
  loadCachedUser: () => Promise<UserDB | null>;
  saveCachedUser: (user: UserDB) => Promise<void>;
}

// 앱 시작 시 로그인 유저 결정. 오프라인이거나 프로필 조회가 실패하면 마지막으로 받은 유저 정보 사용
export const resolveStartupUser = async ({
  isOnline,
  loadSessionUser,
  loadCachedUser,
  saveCachedUser,
}: StartupDeps): Promise<{ isLoggedIn: boolean; user: UserDB | null }> => {
  if (!(await isOnline())) {
    const cached = await loadCachedUser();
    return { isLoggedIn: !!cached, user: cached };
  }

  const { hasSession, user } = await loadSessionUser();
  if (!hasSession) return { isLoggedIn: false, user: null };

  if (user) {
    await saveCachedUser(user);
    return { isLoggedIn: true, user };
  }

  return { isLoggedIn: true, user: await loadCachedUser() };
};
