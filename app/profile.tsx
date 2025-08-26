import { FontAwesome5 } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { unlink } from '@react-native-kakao/user';
import { QueryClient } from '@tanstack/react-query';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { baseProfile, googleIcon, kakaoIconSmall } from 'const/assets';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { UserAPI } from '../api/UserAPI';

export default function Profile() {
  const { avatar_url, email, provider } = useUserStore((state) => state);

  const [isModalVisible, setModalVisible] = useState(false);

  const handleConfirm = async () => {
    await UserAPI.deleteOne();

    if (provider === 'google') await GoogleSignin.signOut();
    if (provider === 'kakao') await unlink();

    if (router.canDismiss) router.dismissAll();
    router.replace('/(auth)');

    const queryClient = new QueryClient();
    queryClient.clear();
  };

  return (
    <View className="flex-1 bg-white">
      <View className="relative flex-1 items-center justify-end gap-6 bg-green-50 py-10">
        <TouchableOpacity onPress={router.back} className="absolute left-6 top-16 z-10">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>

        <View className="h-32 w-32 overflow-hidden rounded-full">
          <Image source={avatar_url ?? baseProfile} style={{ width: '100%', height: '100%' }} />
        </View>
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5">
            {provider === 'google' && (
              <Image source={googleIcon} style={{ width: '100%', height: '100%' }} />
            )}
            {provider === 'kakao' && (
              <Image source={kakaoIconSmall} style={{ width: '100%', height: '100%' }} />
            )}
          </View>
          <Text className="text-lg text-neutral-500">{email}</Text>
        </View>
      </View>
      <View className="mt-6 flex-[3] justify-between px-5">
        <View className="gap-4">
          <Link href={'/(inquiry)'} asChild>
            <RippleButton
              onPress={() => {}}
              rippleColor={colors.neutral[300]}
              className="w-full flex-row items-center !justify-between rounded-xl bg-neutral-100 p-5">
              <View className="flex-row items-center gap-5">
                <FontAwesome5 name="question-circle" size={24} color={colors.neutral[600]} />
                <Text className="text-lg text-neutral-600">문의사항</Text>
              </View>
              <MaterialIcons name="navigate-next" size={24} color={colors.neutral[600]} />
            </RippleButton>
          </Link>
          <RippleButton
            onPress={UserAPI.logout}
            rippleColor={colors.neutral[300]}
            className="w-full flex-row !justify-start rounded-xl bg-neutral-100 p-5">
            <View className="flex-row items-center gap-5">
              <MaterialIcons name="power-settings-new" size={24} color={colors.neutral[600]} />
              <Text className="text-lg text-neutral-600">로그아웃</Text>
            </View>
          </RippleButton>
        </View>
        <View className="mb-20 w-full flex-row items-end justify-between">
          <RippleButton
            outerClassName="border border-red-400"
            className="px-4 py-2"
            onPress={() => setModalVisible(true)}>
            <Text className="text-red-400">회원탈퇴</Text>
          </RippleButton>
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="info-outline" size={16} color={colors.neutral[400]} />
            <Text className="text-neutral-400">
              버전 정보: <Text>{Constants.expoConfig?.version}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ConfirmModal
        type="delete"
        iconElement={<MaterialIcons name="delete-forever" size={60} color={colors.red[600]} />}
        visible={isModalVisible}
        title="정말로 탈퇴하시겠어요?"
        message="탈퇴 시 모든 데이터가 삭제되며, 다시 복구할 수 없어요."
        onConfirm={handleConfirm}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}
