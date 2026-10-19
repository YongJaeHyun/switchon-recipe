import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { usePass } from 'hooks/usePass';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getPassBannerText } from 'utils/passScreen';

// 무료 기간(사전 결제 할인) 중에만 보이는 홈 배너. 판매 중이 아니면 숨긴다
export function PassBanner() {
  const { status } = usePass();
  const text = getPassBannerText(status?.sales);
  if (!text) return null;

  return (
    <RippleButton
      outerClassName="bg-green-600"
      className="w-full flex-row !justify-between px-4 py-3"
      onPress={() => router.push('/pass')}>
      <View className="flex-row items-center gap-2">
        <MaterialIcons name="local-offer" size={20} color={colors.white} />
        <View>
          <Text className="text-xs text-green-100">스위치온 패스 · 자동 결제 없음</Text>
          <Text className="font-bold text-white">{text}</Text>
        </View>
      </View>
      <MaterialIcons name="navigate-next" size={24} color={colors.white} />
    </RippleButton>
  );
}
