import { Text } from 'components/common/Text';
import { View } from 'react-native';

// 레시피 카드 사진 위 주차 칩. 카드 색은 저탄수·무탄수 테두리에만 쓰고, 주차는 색 대신 굵은 흰 글자로
// 보여 준다 (주차 색까지 더하면 2주차 노랑·저탄수 앰버처럼 비슷한 색이 섞여 어지러움).
// 오른쪽 저장(★) 칩과 같은 반투명 검정 바탕이라 밝은 사진 위에서도 잘 읽힌다
export function WeekPill({ week }: { week: number }) {
  return (
    <View className="rounded-full bg-black/60 px-2.5 py-1">
      <Text className="text-sm font-bold text-white">
        {week}주차{week === 3 && '+'}
      </Text>
    </View>
  );
}
