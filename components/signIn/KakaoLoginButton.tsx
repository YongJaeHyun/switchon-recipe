import { login } from '@react-native-kakao/user';
import { selectUserFromDB } from 'api/supabaseAPI';
import { kakaoIcon } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { supabase } from 'lib/supabase';
import { TouchableHighlight } from 'react-native';
import { useUserStore } from 'stores/userStore';

export default function KakaoLoginButton() {
  const setUser = useUserStore((state) => state.setUser);

  async function signInWithKakao() {
    try {
      const response = await login();
      if (response?.idToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'kakao',
          token: response.idToken,
        });

        if (error) {
          console.error('Kakao login error:', error);
        }
        if (data.user.email) {
          const user = await selectUserFromDB(data.user.id);
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
      }
    } catch (error: any) {
      console.error('Kakao login failed:', error);
    }
  }

  return (
    <TouchableHighlight onPress={signInWithKakao} className="rounded-lg">
      <Image style={{ width: 310, height: 44 }} source={kakaoIcon} />
    </TouchableHighlight>
  );
}
