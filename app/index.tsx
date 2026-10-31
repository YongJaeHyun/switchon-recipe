import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserAPI } from 'api/UserAPI';
import { FIRST_LAUNCH_KEY } from 'const/const';
import { Image } from 'expo-image';
import { Redirect, SplashScreen, useRootNavigationState } from 'expo-router';
import { prefetchIngredients } from 'hooks/useIngredients';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useEffect, useState } from 'react';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import { useUserStore } from 'stores/userStore';
import { startupPhase } from 'utils/notificationGate';
import { isOnline } from 'utils/network';
import { withTimeout } from 'utils/withTimeout';

const INGREDIENT_PREFETCH_TIMEOUT_MS = 5000;

SplashScreen.preventAutoHideAsync();

export default function Index() {
  const navigation = useRootNavigationState();
  const isOnboarded = useUserStore((state) => state.is_onboarded);
  const { prefetch: zeroIngredientsPrefetch } = useSelectedIngredients({ type: 'zero' });
  const { prefetch: lowIngredientsPrefetch } = useSelectedIngredients({ type: 'low' });

  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  useEffect(() => {
    if (!navigation?.key) return;

    const checkFirstLaunch = async () => {
      const value = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);

      if (!value) {
        setIsFirstLaunch(true);
      }
      return !value;
    };

    const checkCurrentLogin = async () => {
      const isLoggedIn = await UserAPI.checkIsLoggedIn();
      setIsLoggedIn(!!isLoggedIn);

      // 오프라인이면 건너뜀: Supabase가 토큰 갱신을 재시도하는 동안 요청이 오래 멈춰 스플래시가 길어짐
      if (isLoggedIn && (await isOnline())) {
        await withTimeout(
          Promise.all([zeroIngredientsPrefetch(), lowIngredientsPrefetch()]),
          INGREDIENT_PREFETCH_TIMEOUT_MS
        ).catch((error) => console.error('[prefetchSelectedIngredients]', error));
      }
      return !!isLoggedIn;
    };

    const preloadIngredients = async () => {
      // 스플래시가 네트워크를 오래 기다리지 않도록: 목록은 최대 5초, 이미지는 기다리지 않음
      try {
        const ingredients = await withTimeout(
          prefetchIngredients(),
          INGREDIENT_PREFETCH_TIMEOUT_MS
        );
        Image.prefetch(
          ingredients.map((i) => i.image),
          'disk'
        ).catch((error) => console.error('[preloadIngredients]', error));
      } catch (error) {
        console.error('[preloadIngredients]', error);
      }
    };

    const init = async () => {
      const isFirstLaunch = await checkFirstLaunch();
      const isLoggedIn = await checkCurrentLogin();
      // 탭으로 가지 않으면 눌러 연 알림의 이동은 버린다 (탭으로 가면 탭이 뜬 뒤 이동: useNotificationObserver)
      if (
        startupPhase({
          isFirstLaunch,
          isLoggedIn,
          isOnboarded: useUserStore.getState().is_onboarded,
        }) === 'outside'
      )
        useNotificationGateStore.getState().setPhase('outside');
      await preloadIngredients();

      SplashScreen.hideAsync();
      setIsReady(true);
    };

    init();
  }, [lowIngredientsPrefetch, navigation?.key, zeroIngredientsPrefetch]);

  if (!isReady) return null;
  if (isFirstLaunch) return <Redirect href={'/(greet)'} />;
  if (!isLoggedIn) return <Redirect href={'/(auth)'} />;
  return isOnboarded ? <Redirect href={'/(tabs)'} /> : <Redirect href={'/(auth)/onboard'} />;
}
