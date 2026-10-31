import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';

interface ServingsStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

// 레시피 상세 '재료 요약' 옆 인분 조절: "− 2인분 +"
export function ServingsStepper({ value, min, max, onChange }: ServingsStepperProps) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={!canDecrease}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="인분 줄이기"
        accessibilityState={{ disabled: !canDecrease }}
        className="h-8 w-8 items-center justify-center rounded-full border border-neutral-300">
        <MaterialIcons
          name="remove"
          size={18}
          color={canDecrease ? colors.green[600] : colors.neutral[300]}
        />
      </Pressable>
      <Text
        className="min-w-14 text-center text-medium font-semibold"
        accessibilityLiveRegion="polite">
        {value}인분
      </Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={!canIncrease}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="인분 늘리기"
        accessibilityState={{ disabled: !canIncrease }}
        className="h-8 w-8 items-center justify-center rounded-full border border-neutral-300">
        <MaterialIcons
          name="add"
          size={18}
          color={canIncrease ? colors.green[600] : colors.neutral[300]}
        />
      </Pressable>
    </View>
  );
}
