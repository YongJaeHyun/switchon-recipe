import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserAPI } from 'api/UserAPI';
import { FIRST_LAUNCH_KEY } from 'const/const';
import { Redirect, SplashScreen, useRootNavigationState } from 'expo-router';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useEffect, useState } from 'react';
import { useUserStore } from 'stores/userStore';

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
    };

    const checkCurrentLogin = async () => {
      const isLoggedIn = await UserAPI.checkIsLoggedIn();
      setIsLoggedIn(isLoggedIn);

      if (isLoggedIn) {
        await Promise.all([zeroIngredientsPrefetch(), lowIngredientsPrefetch()]);
      }
    };

    const init = async () => {
      await checkFirstLaunch();
      await checkCurrentLogin();

      SplashScreen.hideAsync();
      setIsReady(true);
    };

    init();
  }, [lowIngredientsPrefetch, navigation?.key, zeroIngredientsPrefetch]);

  if (!isReady) return null;
  if (isFirstLaunch) return <Redirect href={'/(greet)'} />;
  if (!isLoggedIn) return <Redirect href={'/(auth)'} />;
  return isOnboarded ? <Redirect href={'/(tabs)/home'} /> : <Redirect href={'/(auth)/onboard'} />;
}
