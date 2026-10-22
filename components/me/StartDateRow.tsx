import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';

interface StartDateRowProps {
  onPress: () => void;
}

const formatStartDate = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일`;
};

// 시작일 보기·바꾸기 (누르면 시작일 시트를 연다)
export function StartDateRow({ onPress }: StartDateRowProps) {
  const startDate = useUserStore((state) => state.start_date);

  return (
    <RippleButton
      onPress={onPress}
      rippleColor={colors.neutral[300]}
      className="w-full flex-row items-center !justify-between rounded-xl border border-neutral-300 bg-neutral-50 p-5">
      <View className="flex-row items-center gap-5">
        <MaterialIcons name="event" size={24} color={colors.neutral[600]} />
        <Text className="text-lg text-neutral-600">시작일</Text>
      </View>
      <View className="flex-row items-center gap-3">
        {startDate && (
          <Text className="text-lg font-bold text-neutral-700">{formatStartDate(startDate)}</Text>
        )}
        <Text className="font-bold text-green-600">바꾸기</Text>
      </View>
    </RippleButton>
  );
}
