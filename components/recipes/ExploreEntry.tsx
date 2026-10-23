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
      outerClassName="border border-green-200 bg-green-50"
      className="w-full flex-row !justify-between px-4 py-5"
      rippleColor={colors.green[100]}
      onPress={() => router.push('/(tabs)/recipes/explore')}>
      <View className="flex-1 flex-row items-center gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-green-600">
          <MaterialIcons name="explore" size={28} color={colors.white} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-lg font-bold text-neutral-900">다른 사람들의 레시피</Text>
          <Text className="text-sm text-neutral-600">
            스위치온 중인 사람들이 만든 레시피를 둘러보세요
          </Text>
        </View>
      </View>
      <MaterialIcons name="navigate-next" size={26} color={colors.green[700]} />
    </RippleButton>
  );
}
