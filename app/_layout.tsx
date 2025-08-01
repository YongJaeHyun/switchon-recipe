import { initializeKakaoSDK } from '@react-native-kakao/core';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toastConfig } from 'config/toastConfig';
import { isRunningInExpoGo } from 'expo';
import * as Font from 'expo-font';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useAutoUpdate } from 'hooks/useAutoUpdate';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import 'react-native-url-polyfill/auto';
import '../config/CalendarConfig';
import '../global.css';
import '../utils/polyfills';

initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_API_KEY);

const queryClient = new QueryClient();

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 300,
  fade: true,
});

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

  const [isFontsLoaded, setIsFontsLoaded] = useState(false);

  useAutoUpdate();

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  useEffect(() => {
    const prepare = async () => {
      try {
        await Font.loadAsync({
          pretendard: require('../assets/fonts/Pretendard-Regular.otf'),
        });
      } catch (error) {
        Sentry.captureException(error);
      } finally {
        setIsFontsLoaded(true);
      }
    };
    prepare();
  }, []);

  if (!isFontsLoaded) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(greet)" options={{ headerShown: false }} />
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
        </GestureHandlerRootView>
        <Toast config={toastConfig} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
