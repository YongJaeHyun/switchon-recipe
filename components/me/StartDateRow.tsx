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
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${m}월 ${d}일`;
};

// 프로그램 설정(다시 시작·주차 맞추기) 진입. 지금 시작일을 함께 보여 준다
export function StartDateRow({ onPress }: StartDateRowProps) {
  const startDate = useUserStore((state) => state.start_date);

  return (
    <RippleButton
      onPress={onPress}
      rippleColor={colors.neutral[300]}
      className="w-full flex-row items-center !justify-between rounded-xl border border-neutral-300 bg-neutral-50 p-5">
      <View className="flex-row items-center gap-4">
        <MaterialIcons name="event" size={24} color={colors.neutral[600]} />
        <Text className="text-lg text-neutral-600">프로그램 설정</Text>
      </View>
      <View className="flex-row items-center gap-1">
        {startDate && (
          <Text numberOfLines={1} className="font-bold text-neutral-700">
            {formatStartDate(startDate)} 시작
          </Text>
        )}
        <MaterialIcons name="chevron-right" size={24} color={colors.neutral[500]} />
      </View>
    </RippleButton>
  );
}
