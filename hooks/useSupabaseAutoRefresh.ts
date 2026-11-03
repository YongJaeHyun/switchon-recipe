import { supabase } from 'lib/supabase';
import { useEffect } from 'react';
import { AppState } from 'react-native';

// Supabase의 React Native 권장 설정: 앱이 앞에 있을 때만 로그인 토큰을 자동으로 새로 받는다.
// 다시 열리면 바로 새로 받기 시작해서, 만료된 토큰으로 요청이 나가는 틈을 줄인다 (Sentry #31)
export const useSupabaseAutoRefresh = () => {
  useEffect(() => {
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);
};
