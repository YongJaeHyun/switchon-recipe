import { useLinkingURL } from 'expo-linking';
import { Href, Redirect, SplashScreen } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { kakaoLinkRoute, parseKakaoLink } from 'utils/kakaoLink';
import { captureError } from 'utils/sendError';
import { UserAPI } from '../api/UserAPI';

// 카톡 메시지 버튼으로 연 링크 (utils/kakaoLink). 로그인·온보딩을 마친 사람은 바로 레시피로,
// 아니면 시작 화면(app/index → 로그인·온보딩)으로 보내고 레시피는 탭이 뜬 뒤 연다 (hooks/useNotificationObserver)
export default function RedirectKakaoLink() {
  const linkingUrl = useLinkingURL();

  const [targetHref, setTargetHref] = useState<Href | null>(null);

  useEffect(() => {
    const handleUrl = async () => {
      try {
        const target = parseKakaoLink(linkingUrl);
        if (linkingUrl && !target) {
          captureError({
            error: new Error(`잘못된 카카오 링크: ${linkingUrl.slice(0, 200)}`),
            prefix: '[kakaolink]: ',
          });
        }
        const isLoggedIn = target ? !!(await UserAPI.checkIsLoggedIn()) : false;
        const route = kakaoLinkRoute({
          target,
          isLoggedIn,
          isOnboarded: useUserStore.getState().is_onboarded,
        });
        if (route.afterLoginHref) {
          useNotificationGateStore.getState().setAfterLoginHref(route.afterLoginHref as Href);
        }
        // 시작 화면으로 보내면 스플래시는 시작 화면이 사용자 정보를 불러온 뒤 닫는다
        if (route.href !== '/') SplashScreen.hideAsync();
        setTargetHref(route.href as Href);
      } catch (error) {
        captureError({ error, prefix: '[kakaolink]: ', level: 'fatal' });
        setTargetHref('/');
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
