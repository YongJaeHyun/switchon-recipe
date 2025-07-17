import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

const checkSession = async () => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('세션 확인 중 오류 발생:', error.message);
    return null;
  }

  const session = data?.session;

  if (session) {
    return session;
  } else {
    return null;
  }
};

const logout = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('로그아웃 실패:', error.message);
  } else {
    router.replace('/(auth)');
  }
};

export { checkSession, logout };
