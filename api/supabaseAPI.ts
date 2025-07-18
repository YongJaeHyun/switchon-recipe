import { useUserStore } from 'stores/userStore';
import { supabase } from '../lib/supabase';

const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('세션 가져오기 오류:', error.message);
    return null;
  }
  return data.session;
};

const checkIsLoggedIn = async () => {
  const session = await getSession();
  return session?.access_token ? true : false;
};

const logout = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('로그아웃 실패:', error.message);
  } else {
    useUserStore.getState().setUser(null);
  }
};

export { checkIsLoggedIn, getSession, logout };
