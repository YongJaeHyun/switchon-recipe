import { login } from '@react-native-seoul/kakao-login';
import { kakaoIcon } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { supabase } from 'lib/supabase';
import { TouchableHighlight } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { getKoreanToday } from 'utils/date';

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
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata.full_name || '',
            avatar_url: data.user.user_metadata.avatar_url || '',
            provider: data.user.app_metadata.provider,
            created_at: data.user.created_at,
            start_date: getKoreanToday(),
          });
          router.replace('/home');
        }
      }
    } catch (error: any) {
      console.error('Kakao login failed:', error);
    }
  }

  return (
    <TouchableHighlight onPress={signInWithKakao}>
      <Image style={{ width: 310, height: 44 }} source={kakaoIcon} />
    </TouchableHighlight>
  );
}
