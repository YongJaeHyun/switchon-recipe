import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkIsLoggedIn } from 'api/supabaseAPI';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';
import '../utils/polyfills';

const queryClient = new QueryClient();
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loaded, error] = useFonts({
    pretendard: require('../assets/fonts/Pretendard-Regular.otf'),
  });

  useEffect(() => {
    const checkUserLogin = async () => {
      const isLoggedIn = await checkIsLoggedIn();
      setIsLoggedIn(isLoggedIn);
    };

    checkUserLogin();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    if (isLoggedIn) {
      router.replace('/(tabs)/home');
    }
  }, [isLoggedIn]);

  if (!loaded && !error) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
