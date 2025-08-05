import * as Sentry from '@sentry/react-native';
import { checkIsLoggedIn } from 'api/supabaseAPI';
import { useLinkingURL } from 'expo-linking';
import { Href, Redirect, SplashScreen } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';

export default function RedirectKakaoLink() {
  const linkingUrl = useLinkingURL();

  const [targetHref, setTargetHref] = useState<Href | null>(null);

  useEffect(() => {
    const handleUrl = async () => {
      try {
        const url = new URL(linkingUrl, 'switchon-recipe://');
        const host = url.hostname;
        const recipe = url.searchParams.get('recipe');

        if (host === 'kakaolink' && recipe) {
          const isLoggedIn = await checkIsLoggedIn();
          setTargetHref(isLoggedIn ? `/(tabs)/home/recipeDetail?recipe=${recipe}` : '/(auth)');
        } else {
          setTargetHref('/(auth)');
        }
      } catch (error) {
        Sentry.captureException(error);
        setTargetHref('/(auth)');
      } finally {
        SplashScreen.hideAsync();
      }
    };

    handleUrl();
  }, [linkingUrl]);

  if (targetHref === null) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size={56} color={colors.emerald[300]} />
      </View>
    );
  }

  return <Redirect href={targetHref} />;
}
