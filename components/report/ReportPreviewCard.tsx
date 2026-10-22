import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { shouldShowReportPreview } from 'utils/reportDisplay';

// 무료 유저용 주간 리포트 미리보기 (홈·프로필·리포트 목록). 패스를 팔 때만 보이고 누르면 결제 화면으로
export function ReportPreviewCard() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  if (!shouldShowReportPreview(status, billingAvailable)) return null;

  return (
    <RippleButton
      outerClassName="border border-green-200 bg-green-50"
      className="w-full flex-row !justify-between px-4 py-3"
      rippleColor={colors.green[100]}
      onPress={() => router.push('/pass')}>
      <View className="flex-1 flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
          <MaterialIcons name="insights" size={24} color={colors.green[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-neutral-800">이번 주 리포트를 받아보세요</Text>
          <Text className="text-sm text-neutral-500">
            한 주 기록을 정리해 잘한 점과 다음 주 할 일을 알려드려요
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-0.5 rounded-full bg-green-600 px-3 py-1">
        <Text className="text-xs font-bold text-white">패스 보기</Text>
      </View>
    </RippleButton>
  );
}
