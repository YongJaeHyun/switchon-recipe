import {
  GoogleSignin,
  GoogleSigninButton,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from 'const/const';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { captureError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from '../../api/UserAPI';
import { supabase } from '../../lib/supabase';

export default function GoogleLoginButton() {
  const setUser = useUserStore((state) => state.setUser);

  const handlePlayServicesError = () => {
    if (Platform.OS !== 'android') return;

    Alert.alert(
      'Google Play 서비스 업데이트 필요',
      'Google Play 서비스가 최신이 아니어서 로그인을 진행할 수 없습니다. 업데이트 후 다시 시도해주세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '업데이트',
          onPress: () =>
            Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.gms'),
        },
      ]
    );
  };

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();

      const userInfo = await GoogleSignin.signIn();
      if (!userInfo.data?.idToken) return;

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: userInfo.data.idToken,
      });

      if (error) throw error;

      if (data.user.email) {
        const user = await UserAPI.selectOne(data.user.id);
        if (!user) return;

        setUser(user);

        if (user.is_onboarded) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/(auth)/onboard');
        }
      }
    } catch (error) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
          case statusCodes.IN_PROGRESS:
          case statusCodes.SIGN_IN_REQUIRED:
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            handlePlayServicesError();
            break;
        }
      } else {
        showErrorToast({ textType: 'LOGIN_ERROR' });
        captureError({ error, prefix: '[Google Login Error]: ' });
      }
    }
  };

  useEffect(() => {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }, []);

  return (
    <GoogleSigninButton
      size={GoogleSigninButton.Size.Wide}
      color={GoogleSigninButton.Color.Light}
      onPress={signInWithGoogle}
    />
  );
}
