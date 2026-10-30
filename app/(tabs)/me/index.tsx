import { FontAwesome5 } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet from '@gorhom/bottom-sheet';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { unlink } from '@react-native-kakao/user';
import { UserAPI } from 'api/UserAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import AllNoticesModal from 'components/home/AllNoticesModal';
import { StartDateBottomSheet } from 'components/home/StartDateBottomSheet';
import { MealAlarmSetting } from 'components/me/MealAlarmSetting';
import { StartDateRow } from 'components/me/StartDateRow';
import { WeightReminderToggle } from 'components/me/WeightReminderToggle';
import { baseProfile, googleIcon, kakaoIconSmall } from 'const/assets';
import { APP_VERSION, GOOGLE_WEB_CLIENT_ID } from 'const/const';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { queryClient } from 'lib/queryClient';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { requireOnline } from 'utils/network';
import { cancelAccountAlarms } from 'utils/notifications';
import { formatPassRemaining } from 'utils/passDisplay';
import { getDeleteAccountMessage, getPassRemainingDays, isPassOnSale } from 'utils/passScreen';
import { clearCachedUser } from 'utils/userCache';

interface MenuButtonProps {
  title: string;
  icon: ReactNode;
  onPress?: () => void;
}

const DELETE_ACCOUNT_MESSAGE = '탈퇴 시 모든 데이터가 삭제되며, 다시 복구할 수 없어요.';

const MenuButton = ({ title, icon, onPress }: MenuButtonProps) => {
  return (
    <RippleButton
      onPress={onPress}
      rippleColor={colors.neutral[300]}
      className="w-full flex-row items-center !justify-between rounded-xl border border-neutral-300 bg-neutral-50 p-5">
      <View className="flex-row items-center gap-5">
        {icon}
        <Text className="text-lg text-neutral-600">{title}</Text>
      </View>
      <MaterialIcons name="navigate-next" size={24} color={colors.neutral[600]} />
    </RippleButton>
  );
};

export default function MeScreen() {
  const { avatar_url, email, provider } = useUserStore((state) => state);

  const [isModalVisible, setModalVisible] = useState(false);
  const [isNoticesVisible, setNoticesVisible] = useState(false);
  const startDateSheetRef = useRef<BottomSheet>(null);

  const { status: passStatus } = usePass();
  const now = new Date();
  const passRemaining = formatPassRemaining(passStatus?.passExpiresAt ?? null, now);
  const passRemainingDays = getPassRemainingDays(passStatus?.passExpiresAt ?? null, now);
  const billingAvailable = useBillingAvailable();
  // 결제를 못 쓰는 빌드면 "패스 구매"를 숨기고 이용 중 표시도 결제 화면으로 보내지 않는다
  const passOnSale = isPassOnSale(passStatus?.sales, billingAvailable);

  const handleConfirm = async () => {
    await UserAPI.deleteOne();
    await clearCachedUser();
    // 탈퇴한 계정 기준으로 걸어 둔 아침 리마인드·끼니·단식 알림이 남지 않게
    await cancelAccountAlarms();

    if (provider === 'google') await GoogleSignin.signOut();
    if (provider === 'kakao') await unlink();

    if (router.canDismiss()) router.dismissAll();
    router.replace('/(auth)');

    queryClient.clear();
  };

  // 로그아웃: 이 계정 기준 로컬 알림을 지우고 나간다 (다시 로그인하면 앱을 열 때 다시 걸린다)
  const handleLogout = async () => {
    await cancelAccountAlarms();
    await UserAPI.logout();
  };

  useEffect(() => {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }, []);

  return (
    <View className="flex-1 bg-white">
      <ScrollView className="bg-white">
        <View className="mb-6 items-center justify-end gap-6 bg-green-50 pb-10 pt-24">
          <View className="h-28 w-28 overflow-hidden rounded-full">
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

        {(passRemaining || passOnSale) && (
          <View className="mb-6 px-5">
            {passRemaining ? (
              <MenuButton
                title={`스위치온 패스 · ${passRemaining}`}
                icon={<MaterialIcons name="verified" size={24} color={colors.green[600]} />}
                onPress={passOnSale ? () => router.push('/pass') : undefined}
              />
            ) : (
              <MenuButton
                title="패스 구매"
                icon={<MaterialIcons name="local-offer" size={24} color={colors.green[600]} />}
                onPress={() => router.push('/pass')}
              />
            )}
          </View>
        )}

        <View className="mb-20 justify-between px-5">
          <Text className="mb-6 text-lg font-bold">메뉴</Text>
          <View className="gap-4">
            <StartDateRow onPress={() => startDateSheetRef.current?.expand()} />
            <WeightReminderToggle />
            <MealAlarmSetting />
            <MenuButton
              title="공지사항"
              icon={<MaterialIcons name="campaign" size={24} color={colors.neutral[600]} />}
              onPress={() => setNoticesVisible(true)}
            />
            <Link href={'/(inquiry)'} asChild>
              <MenuButton
                title="문의하기"
                icon={<FontAwesome5 name="question-circle" size={24} color={colors.neutral[600]} />}
              />
            </Link>
            <MenuButton
              title="로그아웃"
              icon={
                <MaterialIcons name="power-settings-new" size={24} color={colors.neutral[600]} />
              }
              onPress={requireOnline(handleLogout)}
            />
          </View>
        </View>

        <View className="mb-20 w-full flex-row items-end justify-between px-5">
          <RippleButton
            outerClassName="border border-red-400"
            className="px-4 py-2"
            onPress={() => setModalVisible(true)}>
            <Text className="text-red-400">회원탈퇴</Text>
          </RippleButton>
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="info-outline" size={16} color={colors.neutral[400]} />
            <Text className="text-neutral-400">
              버전 정보: <Text>{APP_VERSION}</Text>
            </Text>
          </View>
        </View>

        <ConfirmModal
          type="delete"
          iconElement={<MaterialIcons name="delete-forever" size={60} color={colors.red[600]} />}
          visible={isModalVisible}
          title="정말로 탈퇴하시겠어요?"
          message={getDeleteAccountMessage(DELETE_ACCOUNT_MESSAGE, passRemainingDays)}
          onConfirm={requireOnline(handleConfirm)}
          onCancel={() => setModalVisible(false)}
        />
      </ScrollView>

      <AllNoticesModal visible={isNoticesVisible} onClose={() => setNoticesVisible(false)} />
      <StartDateBottomSheet bottomSheetRef={startDateSheetRef} />
    </View>
  );
}
