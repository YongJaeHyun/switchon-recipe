import { useLinkingURL } from 'expo-linking';
import { Href, Redirect, SplashScreen } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { kakaoLinkRoute, parseKakaoLink } from 'utils/kakaoLink';
import { captureError } from 'utils/sendError';
import { UserAPI } from '../api/UserAPI';

// 카톡 메시지 버튼으로 연 링크 (utils/kakaoLink). 로그인·온보딩을 마친 사람은 바로 레시피로,
// 아니면 시작 화면(app/index → 로그인·온보딩)으로 보내고 레시피는 탭이 뜬 뒤 연다 (hooks/useNotificationObserver).
// 같이 하자 초대는 친구 시작일을 남겨 두고 홈(이미 시작) 또는 시작 화면(→ 온보딩)으로
export default function RedirectKakaoLink() {
  const linkingUrl = useLinkingURL();

  const [targetHref, setTargetHref] = useState<Href | null>(null);
  // 받은 초대는 이 화면을 떠난 뒤(이동이 끝난 뒤) 남긴다: 이동 중에 띄운 안내는 화면이 바뀌며 사라진다
  const inviteRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (inviteRef.current) {
        useNotificationGateStore.getState().setPendingInvite(inviteRef.current);
      }
    },
    []
  );

  useEffect(() => {
    // 로그인 확인을 기다리는 사이 새 링크가 들어오면 앞 링크 결과는 버린다
    let stale = false;
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
          // 탭이 이미 떠 있을 때만 바로 이동 (앱을 막 켠 링크는 시작 화면 → 탭 위에 연다)
          phase: useNotificationGateStore.getState().phase,
          target,
          isLoggedIn,
          isOnboarded: useUserStore.getState().is_onboarded,
        });
        if (stale) return;
        if (route.afterLoginHref) {
          useNotificationGateStore.getState().setAfterLoginHref(route.afterLoginHref as Href);
        }
        // 같이 하자 초대: 온보딩이 친구 시작일을 선택지로 보이거나, 이미 시작한 사람은 탭이 뜬 뒤 안내
        inviteRef.current = route.invite ?? null;
        // 시작 화면으로 보내면 스플래시는 시작 화면이 사용자 정보를 불러온 뒤 닫는다
        if (route.href !== '/') SplashScreen.hideAsync();
        setTargetHref(route.href as Href);
      } catch (error) {
        captureError({ error, prefix: '[kakaolink]: ', level: 'fatal' });
        if (!stale) setTargetHref('/');
      }
    };

    handleUrl();
    return () => {
      stale = true;
    };
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
