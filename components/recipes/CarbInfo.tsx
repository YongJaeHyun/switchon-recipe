import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import { carbTypeStyle } from 'utils/carbType';

interface CarbInfoProps {
  isZeroCarb: boolean | null | undefined;
  cookingTime: number | null | undefined;
}

// 레시피 카드 아래쪽 한 줄: "● 저탄수 · 🕒 약 20분". 탄수 종류는 카드 테두리 색과 같은 점 + 진한 글자로 보여 준다
// 좁은 카드(192dp) 안쪽 폭에도 text-sm으로 한 줄에 들어간다. 글자를 크게 키운 기기에서는 시간이 말줄임된다
export function CarbInfo({ isZeroCarb, cookingTime }: CarbInfoProps) {
  const style = carbTypeStyle(isZeroCarb);

  return (
    <View className="flex-row items-center">
      <View className={`h-2 w-2 rounded-full ${style.dot}`} />
      <Text numberOfLines={1} className={`ml-1.5 text-sm font-semibold ${style.badgeText}`}>
        {style.label}
      </Text>
      <Text className="mx-1.5 text-sm text-neutral-400">·</Text>
      <Ionicons name="time-outline" size={15} color="#525252" />
      <Text numberOfLines={1} className="ml-1 shrink text-sm text-neutral-600">
        약 {cookingTime}분
      </Text>
    </View>
  );
}
