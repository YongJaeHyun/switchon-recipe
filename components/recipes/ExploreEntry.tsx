import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';

// 탐색 데이터는 여기서 불러오지 않는다. 누르면 탐색 화면이 직접 불러온다
export function ExploreEntry() {
  return (
    <RippleButton
      outerClassName="border border-neutral-200 bg-white"
      className="w-full flex-row !justify-between px-4 py-4"
      rippleColor={colors.neutral[300]}
      onPress={() => router.push('/(tabs)/recipes/explore')}>
      <View className="flex-row items-center gap-3">
        <MaterialIcons name="explore" size={24} color={colors.green[600]} />
        <Text className="text-base font-bold text-neutral-800">다른 사람들의 레시피 둘러보기</Text>
      </View>
      <MaterialIcons name="navigate-next" size={24} color={colors.neutral[400]} />
    </RippleButton>
  );
}
