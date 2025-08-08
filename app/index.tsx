import AsyncStorage from '@react-native-async-storage/async-storage';
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

      if (!value) {
        setIsFirstLaunch(true);
      }
    };

    const checkCurrentLogin = async () => {
      const isLoggedIn = await checkIsLoggedIn();
      setIsLoggedIn(isLoggedIn);
    };

    const init = async () => {
      await checkFirstLaunch();
      await checkCurrentLogin();

      SplashScreen.hideAsync();
      setIsReady(true);
    };

    init();
  }, [navigation?.key]);

  if (!isReady) return null;
  if (isFirstLaunch) return <Redirect href={'/(greet)'} />;
  if (!isLoggedIn) return <Redirect href={'/(auth)'} />;
  return isOnboarded ? <Redirect href={'/(tabs)/home'} /> : <Redirect href={'/(auth)/onboard'} />;
}
