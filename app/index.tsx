import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { checkIsLoggedIn } from 'api/supabaseAPI';
import { FIRST_LAUNCH_KEY } from 'const/const';
import { Redirect, SplashScreen, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { useUserStore } from 'stores/userStore';

SplashScreen.preventAutoHideAsync();

export default function Index() {
  const navigation = useRootNavigationState();
  const isOnboarded = useUserStore((state) => state.is_onboarded);

  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  useEffect(() => {
    if (!navigation?.key) return;

    const checkFirstLaunch = async () => {
      const value = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      Sentry.captureMessage(value);

      if (!value) {
        setIsFirstLaunch(true);
      }
    };

    const checkCurrentLogin = async () => {
      const isLoggedIn = await checkIsLoggedIn();
      setIsLoggedIn(isLoggedIn);

      SplashScreen.hideAsync();
      setIsReady(true);
    };

    checkFirstLaunch();
    checkCurrentLogin();
  }, [navigation?.key]);

  if (!isReady) return null;
  if (isReady && isFirstLaunch) return <Redirect href={'/(greet)'} />;
  if (isReady && !isLoggedIn) return <Redirect href={'/(auth)'} />;
  return isOnboarded ? <Redirect href={'/(tabs)/home'} /> : <Redirect href={'/(auth)/onboard'} />;
}
