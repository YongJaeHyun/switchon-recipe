import { PortalProvider } from '@gorhom/portal';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { WeekCompletePopup } from 'components/common/WeekCompletePopup';
import { toastConfig } from 'config/toastConfig';
import { isRunningInExpoGo } from 'expo';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useAutoUpdate } from 'hooks/useAutoUpdate';
import { queryClient } from 'lib/queryClient';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import 'react-native-url-polyfill/auto';
import '../config/CalendarConfig';
import '../global.css';
import '../utils/polyfills';

initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_API_KEY);

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
  tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [navigationIntegration, Sentry.mobileReplayIntegration()],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

function RootLayout() {
  const ref = useNavigationContainerRef();

  const updated = useAutoUpdate();

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  if (!updated) {
    return null;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PortalProvider>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(greet)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(inquiry)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)/home" options={{ headerShown: false }} />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="kakaolink" options={{ headerShown: false }} />
            </Stack>
          </PortalProvider>
        </GestureHandlerRootView>
        <Toast config={toastConfig} />
        <WeekCompletePopup />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
