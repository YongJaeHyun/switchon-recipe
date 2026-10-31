import { Text } from 'components/common/Text';
import { Checkbox } from 'expo-checkbox';
import { TouchableWithoutFeedback, View } from 'react-native';
import colors from 'tailwindcss/colors';

// 완주 인증에 감량한 체중을 붙일지 (기본 꺼짐). 보낼 값을 옆에 보여 줘 무엇이 나가는지 알 수 있게 한다
export function WeightLossCheckbox({
  lossKg,
  value,
  onChange,
}: {
  lossKg: number;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <TouchableWithoutFeedback
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}>
      <View className="flex-row items-center gap-2 py-1">
        <Checkbox
          color={value ? colors.green[600] : colors.neutral[400]}
          value={value}
          onValueChange={onChange}
          style={{ width: 18, height: 18, borderRadius: 4 }}
        />
        <Text className="text-sm text-neutral-600">
          감량한 체중도 함께 보내기{' '}
          <Text className="text-neutral-400">(-{lossKg.toFixed(1)}kg)</Text>
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}
