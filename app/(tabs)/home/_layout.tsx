import { router, Stack } from 'expo-router';
import { supabase } from 'lib/supabase';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';

export default function HomeLayout() {
  const resetUser = useUserStore((state) => state.resetUser);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session && event === 'SIGNED_OUT') {
        await resetUser();

        if (router.canDismiss()) router.dismissAll();
        router.replace('/(auth)');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [resetUser]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
      <Stack.Screen name="savedRecipes" options={{ title: '저장한 레시피' }} />
    </Stack>
  );
}
