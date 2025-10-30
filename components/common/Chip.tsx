import { Feather } from '@expo/vector-icons';
import { ComponentPropsWithoutRef } from 'react';
import { Pressable } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from './RippleButton';
import { Text } from './Text';

interface ChipProps extends ComponentPropsWithoutRef<typeof Pressable> {
  value: string;
  onDelete?: () => void;
  showDeleteIcon?: boolean;
  outerClassName?: string;
  rippleColor?: string;
}

export function Chip({
  value,
  onPress,
  onDelete,
  outerClassName,
  className,
  rippleColor = colors.neutral[400],
  showDeleteIcon = true,
}: ChipProps) {
  return (
    <RippleButton
      onPress={onPress}
      rippleColor={rippleColor}
      className={`flex-row items-center gap-2 rounded-full border px-3 py-2 ${outerClassName}`}
      animation={false}>
      <Text className={className}>{value}</Text>
      {showDeleteIcon && (
        <RippleButton
          onPress={onDelete ?? onPress}
          className="p-0.5"
          rippleColor={rippleColor}
          animation={false}>
          <Feather name="x" size={16} color="black" />
        </RippleButton>
      )}
    </RippleButton>
  );
}
