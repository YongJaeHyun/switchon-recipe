import { useLinkingURL } from 'expo-linking';
import { Href, Redirect, SplashScreen } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { captureError } from 'utils/sendError';
import { UserAPI } from '../api/UserAPI';

export default function RedirectKakaoLink() {
  const linkingUrl = useLinkingURL();

  const [targetHref, setTargetHref] = useState<Href | null>(null);

  useEffect(() => {
    const handleUrl = async () => {
      try {
        if (!linkingUrl) throw new Error('linkingUrl이 없습니다.');

        const url = new URL(linkingUrl, 'switchon-recipe://');
        const host = url.hostname;
        const recipe = url.searchParams.get('recipe');

        if (host === 'kakaolink' && recipe) {
          const isLoggedIn = await UserAPI.checkIsLoggedIn();
          setTargetHref(isLoggedIn ? `/recipeDetail?recipe=${recipe}` : '/(auth)');
        } else {
          setTargetHref('/(auth)');
        }
      } catch (error) {
        captureError({ error, prefix: '[kakaolink]: ', level: 'fatal' });
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
