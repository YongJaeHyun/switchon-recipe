import {
  GoogleSignin,
  GoogleSigninButton,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';
import { supabase } from '../../lib/supabase';

export default function GoogleLoginButton() {
  const router = useRouter();
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
              setUser({
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata.full_name || '',
                avatar_url: data.user.user_metadata.avatar_url || '',
                provider: data.user.app_metadata.provider,
                created_at: data.user.created_at,
              });
              router.replace('/home');
            }
          } else {
            throw new Error('no ID token present!');
          }
        } catch (error: any) {
          console.log('Sign in error:', error);
          if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            // user cancelled the login flow
          } else if (error.code === statusCodes.IN_PROGRESS) {
            // operation (e.g. sign in) is in progress already
          } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            // play services not available or outdated
          } else {
            // some other error happened
          }
        }
      }}
    />
  );
}
