import { Text } from 'components/common/Text';
import { View } from 'react-native';

// 패스 없이 써 볼 수 있는 횟수. 잠금 배지(PassBadge, 진한 초록 채움)와 구분되게 테두리만 쓴다
export function TrialBadge({ remaining }: { remaining: number }) {
  return (
    <View className="rounded-full border border-green-600 bg-white px-2 py-0.5">
      <Text className="text-xs font-bold text-green-700">무료 {remaining}번</Text>
    </View>
  );
}
