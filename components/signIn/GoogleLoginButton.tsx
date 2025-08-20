import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';
import { captureError } from 'utils/sendError';
import { UserAPI } from '../../api/UserAPI';
import { supabase } from '../../lib/supabase';

export default function GoogleLoginButton() {
  const setUser = useUserStore((state) => state.setUser);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '122886446696-o8aeohmp226otako4jklaqb0thm25qtu.apps.googleusercontent.com',
    });
  }, []);

  return (
    <GoogleSigninButton
      size={GoogleSigninButton.Size.Wide}
      color={GoogleSigninButton.Color.Light}
      onPress={async () => {
        try {
          await GoogleSignin.hasPlayServices();

          const userInfo = await GoogleSignin.signIn();
          if (userInfo.data.idToken) {
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: userInfo.data.idToken,
            });

            if (error) {
              throw new Error(`Supabase sign-in error: ${error.message}`);
            }
            if (data.user.email) {
              const user = await UserAPI.selectOne(data.user.id);
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
          } else {
            throw new Error('no ID token present!');
          }
        } catch (error: any) {
          if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            // user cancelled the login flow
          } else if (error.code === statusCodes.IN_PROGRESS) {
            captureError({ error, prefix: '[Google Login Error - IN_PROGRESS]: ', level: 'fatal' });
          } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            captureError({
              error,
              prefix: '[Google Login Error - PLAY_SERVICES_NOT_AVAILABLE]: ',
              level: 'fatal',
            });
          } else {
            captureError({
              error,
              prefix: '[Google Login Error - Something Wrong]: ',
              level: 'fatal',
            });
          }
        }
      }}
    />
  );
}
