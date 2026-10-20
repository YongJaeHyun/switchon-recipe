import { router } from 'expo-router';
import { supabase } from 'lib/supabase';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';
import { clearCachedUser } from 'utils/userCache';

export const useAuthStateObserver = () => {
  const resetUser = useUserStore((state) => state.resetUser);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session && event === 'SIGNED_OUT') {
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
