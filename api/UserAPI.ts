import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { UserDB } from 'types/database';
import { sendError } from 'utils/sendError';
import { showSuccessToast } from 'utils/showToast';
import { isOnline } from 'utils/network';
import { resolveStartupUser } from 'utils/resolveStartupUser';
import { loadCachedUser, saveCachedUser } from 'utils/userCache';

const getSession = async () =>
  sendError(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return data.session;
  });

const checkIsLoggedIn = async () =>
  sendError(async () => {
    const { isLoggedIn, user } = await resolveStartupUser({
      isOnline,
      loadSessionUser: async () => {
        const session = await getSession();
        if (!session?.access_token) return { hasSession: false, user: null };
        return { hasSession: true, user: (await selectOne(session.user.id)) ?? null };
      },
      loadCachedUser,
      saveCachedUser,
    });

    if (user) await useUserStore.getState().setUser(user);
    return isLoggedIn;
  });

const logout = async () =>
  sendError(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;
  });

const selectOne = async (userId: string) =>
  sendError(async () => {
    const { data, error } = await supabase.from('user').select().eq('id', userId).single<UserDB>();

    if (error) throw error;

    return data;
  });

// 온보딩은 새 회차: 회차 시작일(program_start)도 시작일로
const updateOnboarding = async (start_date: string) =>
  sendError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('user')
      .update({ start_date, program_start: start_date, is_onboarded: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
  });

// program_start: 바뀐 뒤의 회차 시작일 (nextProgramStart). 시작일과 한 번에 저장한다.
// toast: 이 흐름에 맞는 성공 문구 (없으면 기본 "시작날짜 재설정 성공"). 성공하면 true, 실패하면 undefined
const updateStartDate = async (
  start_date: string,
  program_start: string,
  options?: { toast?: { title: string; subtitle: string } }
) =>
  sendError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('user')
      .update({ start_date, program_start })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
    showSuccessToast({
      textType: 'CUSTOM',
      title: options?.toast?.title ?? '시작날짜 재설정 성공',
      subtitle: options?.toast?.subtitle ?? `${start_date}일로 정상적으로 변경되었습니다`,
    });
    return true;
  });

const updatePushToken = async (pushToken: string) =>
  sendError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('user')
      .update({ push_token: pushToken })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
  });

const deleteOne = async () =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) return;

    const { error } = await supabase.from('user').delete().eq('id', userId);

    if (error) throw error;

    showSuccessToast({ textType: 'DELETE_ACCOUNT_SUCCESS' });
  });

export const UserAPI = {
  selectOne,
  logout,
  deleteOne,
  updateOnboarding,
  updateStartDate,
  checkIsLoggedIn,
  getSession,
  updatePushToken,
};
