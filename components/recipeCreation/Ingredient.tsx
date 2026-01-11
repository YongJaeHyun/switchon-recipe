import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import React from 'react';
import { TouchableHighlight, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeType } from 'types/database';
import { Ingredient as IngredientType } from 'types/recipe';

interface IngredientProps extends IngredientType {
  isSelected: boolean;
  disabled: boolean;
}

function Ingredient({ name, image, week, isSelected, disabled }: IngredientProps) {
  const type = useLastPathname() as RecipeType;
  const { toggleIngredient } = useSelectedIngredients({ type });

  const isSelectedLow = isSelected && type === 'low';
  const isSelectedZero = isSelected && type === 'zero';

  const toggleSelect = () => {
    toggleIngredient({ name, image, week });
  };
  return (
    <TouchableHighlight
      className={`h-32 w-24 items-center justify-center rounded-lg ${disabled && 'opacity-40'}`}
      onPress={toggleSelect}
      underlayColor={colors.neutral[200]}
      disabled={disabled}>
      <View className="items-center gap-1">
        <View
          className={`h-20 w-20 overflow-hidden rounded-full 
          ${isSelectedZero && 'border-[4px] border-green-700/80'} 
          ${isSelectedLow && 'border-[4px] border-amber-600'} 
          ${!isSelected && 'border-2 border-neutral-200'}`}>
          <Image style={{ width: '100%', height: '100%', objectFit: 'cover' }} source={image} />
        </View>
        <Text className={`h-6 w-full ${isSelected ? 'font-bold' : 'font-semibold'}`}>{name}</Text>
      </View>
    </TouchableHighlight>
  );
}

export default React.memo(Ingredient);
