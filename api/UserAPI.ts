import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { UserDB } from 'types/database';
import { sendDBError } from 'utils/sendError';
import { showSuccessToast } from 'utils/showToast';

const getSession = async () =>
  sendDBError(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return data.session;
  });

const checkIsLoggedIn = async () =>
  sendDBError(
    async () => {
      const session = await getSession();

      if (session?.access_token) {
        const setUser = useUserStore.getState().setUser;
        const user = await selectOne(session.user.id);

        if (user) {
          await setUser(user);
        }
      }

      return session?.access_token ? true : false;
    },
    {
      errorReturnValue: false,
    }
  );

const logout = async () =>
  sendDBError(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;
  });

const selectOne = async (userId: string) =>
  sendDBError(async () => {
    const { data, error } = await supabase.from('user').select().eq('id', userId).single<UserDB>();

    if (error) throw error;

    return data;
  });

const updateOnboarding = async (start_date: string) =>
  sendDBError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('user')
      .update({ start_date, is_onboarded: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
  });

const updateStartDate = async (start_date: string) =>
  sendDBError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('user')
      .update({ start_date })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
    showSuccessToast({
      textType: 'CUSTOM',
      title: '시작날짜 재설정 성공',
      subtitle: `${start_date}일로 정상적으로 변경되었습니다`,
    });
  });

const deleteOne = async () =>
  sendDBError(async () => {
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
};
