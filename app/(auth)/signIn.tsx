import GoogleLoginButton from 'components/signIn/GoogleLoginButton';
import KakaoLoginButton from 'components/signIn/KakaoLoginButton';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logo } from '../../const/assets';

export default function SignInScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="mb-28 mt-32 flex-1 items-center justify-between">
        <View className="items-center">
          <Image style={{ width: 120, height: 120 }} source={logo} />
          <Text className="mt-6 text-4xl font-bold">스위치온 레시피</Text>
          <Text className="mt-1 text-sm font-bold text-neutral-500">
            스위치온 다이어트, 뭐 먹을지 고민될 땐?
          </Text>
        </View>
        <View className="items-center gap-8">
          <GoogleLoginButton />
          <KakaoLoginButton />
        </View>
      </View>
    </SafeAreaView>
  );
}
