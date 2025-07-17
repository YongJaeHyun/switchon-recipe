import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkSession } from 'api/supabaseAPI';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';
import '../utils/polyfills';

const queryClient = new QueryClient();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState(null);
  const [loaded, error] = useFonts({
    pretendard: require('../assets/fonts/Pretendard-Regular.otf'),
  });

  const checkSessionAndLoad = async () => {
    const session = await checkSession();
    if (session) {
      setSession(session);
    }
  };

  useEffect(() => {
    checkSessionAndLoad();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  if (session?.access_token) {
    router.replace('/(tabs)/home');
  }
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
