import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';

// 스위치온 패스 전용 기능 표시. 패스가 없으면 잠금(진한 초록), 있으면 쓰고 있는 혜택(연한 초록)
export function PassBadge({ locked, label = '패스' }: { locked: boolean; label?: string }) {
  return (
    <View
      className={`flex-row items-center gap-0.5 rounded-full px-2 py-0.5 ${
        locked ? 'bg-green-600' : 'bg-green-50'
      }`}>
      <MaterialIcons
        name={locked ? 'lock' : 'check'}
        size={12}
        color={locked ? colors.white : colors.green[700]}
      />
      <Text className={`text-xs font-bold ${locked ? 'text-white' : 'text-green-700'}`}>
        {label}
      </Text>
    </View>
  );
}
