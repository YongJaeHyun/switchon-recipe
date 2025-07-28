import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { logout } from 'api/supabaseAPI';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text, TouchableHighlight, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';

export default function Profile() {
  const userInfo = useUserStore((state) => state.user);

  const logoutAndRedirect = async () => {
    await logout();
    router.replace('/(auth)');
  };
  return (
    <View className="flex-1 bg-white">
      <View className="relative flex-1 items-center justify-center gap-3 bg-green-50 pt-4">
        <TouchableOpacity onPress={router.back} className="absolute left-6 top-16 z-10">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>

        <View className="h-32 w-32 overflow-hidden rounded-full">
          <Image source={{ uri: userInfo?.avatar_url }} style={{ width: '100%', height: '100%' }} />
        </View>
        <Text className="text-2xl font-semibold">{userInfo?.name}</Text>
        <Text className="text-lg text-neutral-500">{userInfo?.email}</Text>
      </View>
      <View className="mt-6 flex-[2] gap-4 px-5">
        <TouchableHighlight
          onPress={() => {}}
          underlayColor={colors.neutral[300]}
          className="w-full items-center rounded-xl bg-neutral-100 py-4">
          <Text className="text-lg text-neutral-600">문의사항 보내기</Text>
        </TouchableHighlight>
        <TouchableHighlight
          onPress={logoutAndRedirect}
          underlayColor={colors.neutral[300]}
          className="w-full items-center rounded-xl bg-neutral-100 py-4">
          <Text className="text-lg text-neutral-600">로그아웃</Text>
        </TouchableHighlight>
      </View>
    </View>
  );
}
