import { login } from '@react-native-kakao/user';
import { UserAPI } from 'api/UserAPI';
import { kakaoIcon } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { supabase } from 'lib/supabase';
import { TouchableHighlight } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { sendError } from 'utils/sendError';

export default function KakaoLoginButton() {
  const setUser = useUserStore((state) => state.setUser);

  const signInWithKakao = () =>
    sendError(
      async () => {
        const response = await login();
        if (!response?.idToken) throw new Error('no ID token present!');

        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'kakao',
          token: response.idToken,
        });

        if (error) throw new Error(error.message);

        if (data.user?.email) {
          const user = await UserAPI.selectOne(data.user.id);
          if (!user) return;

          setUser({
            id: user.id,
            email: user.email,
            avatar_url: user.avatar_url,
            provider: user.provider,
            created_at: user.created_at,
            start_date: user.start_date,
            is_onboarded: user.is_onboarded,
          });

          if (user.is_onboarded) {
            router.replace('/(tabs)/home');
          } else {
            router.replace('/(auth)/onboard');
          }
        }
      },
      {
        prefix: '[Kakao Login Error]: ',
        textType: 'LOGIN_ERROR',
      }
    );
  return (
    <TouchableHighlight onPress={signInWithKakao} className="rounded-lg">
      <Image style={{ width: 310, height: 44 }} source={kakaoIcon} />
    </TouchableHighlight>
  );
}
