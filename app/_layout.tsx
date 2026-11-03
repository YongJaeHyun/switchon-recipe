import { PortalProvider } from '@gorhom/portal';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import { QueryClientProvider } from '@tanstack/react-query';
import { RecipeJobBand } from 'components/common/RecipeJobBand';
import { ReviewPromptModal } from 'components/common/ReviewPromptModal';
import { WeekCompletePopup } from 'components/common/WeekCompletePopup';
import { RecipeByNameSheet } from 'components/recipeByName/RecipeByNameSheet';
import { toastConfig } from 'config/toastConfig';
import { isRunningInExpoGo } from 'expo';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useAuthStateObserver } from 'hooks/useAuthStateObserver';
import { StoreUpdateModal } from 'components/common/StoreUpdateModal';
import { useAutoUpdate } from 'hooks/useAutoUpdate';
import { useNotificationObserver } from 'hooks/useNotificationObserver';
import { useSupabaseAutoRefresh } from 'hooks/useSupabaseAutoRefresh';
import { usePassPurchaseRecovery } from 'hooks/usePassPurchaseRecovery';
import { queryClient } from 'lib/queryClient';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import 'react-native-url-polyfill/auto';
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
// process.env.APP_ENV는 앱 번들에 들어가지 않아(EXPO_PUBLIC_만 들어감) 운영에서도 늘 비어 있었다 →
// 모든 사용자가 개발용 설정(세션 녹화 100%, 성능 추적·프로파일링 100%)으로 돌았다. 개발 빌드 여부(__DEV__)로 나눈다.
// 운영: 세션 녹화·프로파일링 끔 (네이티브에서 계속 돌아 복귀 직후 SIGABRT의 유력 원인), 성능 추적 10%
const isDevBuild = __DEV__;
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  environment: isDevBuild ? 'development' : 'production',
  tracesSampleRate: isDevBuild ? 1.0 : 0.1,
  profilesSampleRate: isDevBuild ? 1.0 : 0,
  replaysSessionSampleRate: isDevBuild ? 1.0 : 0,
  replaysOnErrorSampleRate: 0,
  integrations: isDevBuild
    ? [navigationIntegration, Sentry.mobileReplayIntegration()]
    : [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});
// 어떤 OTA에서 난 오류인지 알 수 있게 (릴리즈는 스토어 빌드만 구분해서 OTA를 모른다)
Sentry.setTag('update_id', Updates.updateId ?? 'embedded');
Sentry.setTag('update_channel', Updates.channel ?? 'unknown');

function RootLayout() {
  const ref = useNavigationContainerRef();

  const updated = useAutoUpdate();

  useNotificationObserver();
  useSupabaseAutoRefresh();
  useAuthStateObserver();
  usePassPurchaseRecovery();

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  if (!updated) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PortalProvider>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(greet)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(inquiry)" options={{ headerShown: false }} />
              <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
              <Stack.Screen
                name="cookingMode"
                options={{ headerShown: false, animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="recipeCreation/zero"
                options={{ title: '무탄수 레시피 제작', headerTitleStyle: { fontSize: 20 } }}
              />
              <Stack.Screen
                name="recipeCreation/low"
                options={{ title: '저탄수 레시피 제작', headerTitleStyle: { fontSize: 20 } }}
              />
              <Stack.Screen name="profile" options={{ headerShown: false }} />
              <Stack.Screen name="pass" options={{ headerShown: false }} />
              <Stack.Screen name="foodCheck" options={{ headerShown: false }} />
              <Stack.Screen name="recommend" options={{ headerShown: false }} />
              <Stack.Screen name="weight" options={{ headerShown: false }} />
              <Stack.Screen name="report" options={{ headerShown: false }} />
              <Stack.Screen name="kakaolink" options={{ headerShown: false }} />
            </Stack>
            {/* 스토어 업데이트 안내 (서버 스위치, 옛 스토어 빌드에서만) */}
            <StoreUpdateModal />
            {/* 뒤에서 만드는 레시피 띠는 화면 위에, 바텀시트(Portal)는 띠 위에 그려진다 */}
            <RecipeJobBand />
            <RecipeByNameSheet />
          </PortalProvider>
        </GestureHandlerRootView>
        <Toast config={toastConfig} />
        <WeekCompletePopup />
        {/* 앱 리뷰 묻기 (좋은 순간에만, utils/reviewPrompt) */}
        <ReviewPromptModal />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
