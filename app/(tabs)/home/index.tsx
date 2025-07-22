import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { logout } from 'api/supabaseAPI';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { Button, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { recipeButtonBG } from 'utils/assets';

export default function HomeScreen() {
  const userInfo = useUserStore((state) => state.user);

  const logoutAndRedirect = async () => {
    await logout();
    router.replace('/(auth)');
  };

  if (!userInfo) logoutAndRedirect();
  return (
    <SafeAreaView className="flex-1 bg-neutral-100 px-5">
      <View className="mt-8 flex-row items-center justify-between">
        <Text className="text-neutral-600">오늘도 화이팅!</Text>
        <View className="flex-row items-center gap-5">
          <Feather name="settings" size={24} />
          <Pressable className="h-10 w-10 overflow-hidden rounded-full">
            <Image style={{ width: '100%', height: '100%' }} source={userInfo?.avatar_url} />
          </Pressable>
        </View>
      </View>
      <Text style={{ fontFamily: 'roboto' }} className="text-4xl font-bold">
        1일차
      </Text>

      <View
        className="my-6"
        style={{ borderBottomWidth: 2, borderBottomColor: colors.neutral[400] }}
      />

      <Link
        href={'/(tabs)/home/recipeCreation'}
        className="h-44 w-full overflow-hidden rounded-xl bg-white shadow-lg">
        <View className="flex-1 flex-row">
          <View className="flex-[3] justify-between px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold">레시피 제작</Text>
              <MaterialIcons name="arrow-forward-ios" size={24} color={colors.neutral[400]} />
            </View>
            <View>
              <Text className="text-lg">내가 가지고 있는 재료로</Text>
              <Text className="text-lg">레시피 제작!</Text>
            </View>
          </View>
          <View className="h-full w-full flex-[2]">
            <Image style={{ width: '100%', height: '100%' }} source={recipeButtonBG} />
          </View>
        </View>
      </Link>
      <Button title="로그아웃" onPress={logoutAndRedirect} />
    </SafeAreaView>
  );
}
