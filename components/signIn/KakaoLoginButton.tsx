import { Image } from 'expo-image';
import { RelativePathString, useRouter } from 'expo-router';
import { supabase } from 'lib/supabase';
import { Pressable } from 'react-native';
import { kakaoIcon } from 'utils/assets';

export default function KakaoLoginButton() {
  const router = useRouter();

  async function signInWithKakao() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: 'switchon-recipe://home',
      },
    });
    if (error) {
      console.error('Kakao login error:', error);
    }
    if (data.url) {
      router.replace(data.url as RelativePathString);
    }
  }

  return (
    <Pressable onPress={signInWithKakao}>
      <Image style={{ width: 310, height: 44 }} source={kakaoIcon} />
    </Pressable>
  );
}
