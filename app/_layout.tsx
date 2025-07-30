import { initializeKakaoSDK } from '@react-native-kakao/core';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { checkIsLoggedIn } from 'api/supabaseAPI';
import { toastConfig } from 'config/toastConfig';
import { isRunningInExpoGo } from 'expo';
import { useFonts } from 'expo-font';
import { router, Stack, useNavigation, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { supabase } from 'lib/supabase';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useUserStore } from 'stores/userStore';
import '../config/CalendarConfig';
import '../global.css';
import '../utils/polyfills';

initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_API_KEY);

const queryClient = new QueryClient();
SplashScreen.preventAutoHideAsync();

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

function RootLayout() {
  const ref = useNavigationContainerRef();
  const navigation = useNavigation();

  const [loaded, error] = useFonts({
    pretendard: require('../assets/fonts/Pretendard-Regular.otf'),
  });

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  useEffect(() => {
    const prepare = async () => {
      const isLoggedIn = await checkIsLoggedIn();
      if (isLoggedIn) {
        const isOnboarded = useUserStore.getState().is_onboarded;

        if (isOnboarded) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/(auth)/onboard');
        }
      }

      if (loaded || error) {
        await SplashScreen.hideAsync();
      }
    };
    prepare();
  }, [loaded, error]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        const resetUser = useUserStore.getState().resetUser;
        await resetUser();

        if (router.canDismiss()) router.dismissAll();
        router.replace('/(auth)/signIn');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigation]);

  if (!loaded && !error) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)/home" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen
              name="recipeCreation"
              options={{
                title: '레시피 제작',
                headerTitleStyle: { fontFamily: 'pretendard', fontSize: 20 },
              }}
            />
          </Stack>
        </SafeAreaProvider>
        <Toast config={toastConfig} />
        <StatusBar style="dark" />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
