import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import React from 'react';
import { TouchableHighlight, View } from 'react-native';
import colors from 'tailwindcss/colors';

export type IngredientTileTone = 'zero' | 'low' | 'exclude';

const SELECTED_BORDER: Record<IngredientTileTone, string> = {
  zero: 'border-[4px] border-green-700/80',
  low: 'border-[4px] border-amber-600',
  exclude: 'border-[4px] border-red-500',
};

interface IngredientTileProps {
  name: string;
  image: string;
  isSelected: boolean;
  disabled: boolean;
  tone: IngredientTileTone;
  // 동그라미 가운데 덮어 쓰는 글자 (무탄수 화면의 "저탄수" 등)
  overlayLabel?: string;
  onPress(): void;
}

// 재료 동그라미 한 칸 (보여주기만). 선택 상태 관리는 쓰는 쪽이 한다
function IngredientTile({
  name,
  image,
  isSelected,
  disabled,
  tone,
  overlayLabel,
  onPress,
}: IngredientTileProps) {
  return (
    <TouchableHighlight
      className={`h-32 min-w-24 items-center justify-center rounded-lg ${disabled && 'opacity-40'}`}
      onPress={onPress}
      underlayColor={colors.neutral[200]}
      disabled={disabled}>
      <View className="relative items-center gap-1">
        <View
          className={`h-20 w-20 overflow-hidden rounded-full ${isSelected ? SELECTED_BORDER[tone] : 'border-2 border-neutral-200'}`}>
          {overlayLabel && (
            <View className="absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
              <Text className="text-md font-bold">{overlayLabel}</Text>
            </View>
          )}
          <Image style={{ width: '100%', height: '100%', objectFit: 'cover' }} source={image} />
        </View>
        <Text className={`h-6 w-full ${isSelected ? 'font-bold' : 'font-semibold'}`}>{name}</Text>
      </View>
    </TouchableHighlight>
  );
}

export default React.memo(IngredientTile);
