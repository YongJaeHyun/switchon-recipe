import { router } from 'expo-router';
import { supabase } from 'lib/supabase';
import { useEffect } from 'react';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useUserStore } from 'stores/userStore';
import { cancelAccountAlarms } from 'utils/notifications';
import { clearCachedUser } from 'utils/userCache';

export const useAuthStateObserver = () => {
  const resetUser = useUserStore((state) => state.resetUser);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session && event === 'SIGNED_OUT') {
        // 세션이 만료돼 나가도 로그아웃 버튼과 같이 이 계정의 로컬 알림·끼니 알림 설정을 지운다
        // (시작일을 모르는 동안 알림 맞추기는 건너뛰므로 여기서 지우지 않으면 남는다)
        await cancelAccountAlarms();
        useMealAlarmStore.getState().reset();
        await resetUser();
        await clearCachedUser();

        if (router.canDismiss()) router.dismissAll();
        router.replace('/(auth)');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [resetUser]);
};
