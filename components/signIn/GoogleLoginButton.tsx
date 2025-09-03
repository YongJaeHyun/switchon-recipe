import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';
import { sendError } from 'utils/sendError';
import { UserAPI } from '../../api/UserAPI';
import { supabase } from '../../lib/supabase';

export default function GoogleLoginButton() {
  const setUser = useUserStore((state) => state.setUser);

  const signInWithGoogle = () =>
    sendError(
      async () => {
        await GoogleSignin.hasPlayServices();

        const userInfo = await GoogleSignin.signIn();
        if (!userInfo.data?.idToken) throw new Error('no ID token present!');

        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });

        if (error) throw new Error(error.message);

        if (data.user.email) {
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
        textType: 'LOGIN_ERROR',
        prefix: '[Google Login Error]: ',
      }
    );

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '122886446696-o8aeohmp226otako4jklaqb0thm25qtu.apps.googleusercontent.com',
    });
  }, []);

  return (
    <GoogleSigninButton
      size={GoogleSigninButton.Size.Wide}
      color={GoogleSigninButton.Color.Light}
      onPress={signInWithGoogle}
    />
  );
}
