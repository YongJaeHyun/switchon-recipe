import { Image } from 'expo-image';
import React from 'react';
import { Text, TouchableHighlight, View } from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import colors from 'tailwindcss/colors';
import { IIngredient } from 'types/recipe';

interface IngredientProps extends IIngredient {
  isSelected: boolean;
  disabled: boolean;
}

function Ingredient({ name, image, week, isSelected, disabled }: IngredientProps) {
  const toggleIngredient = useIngredientStore((state) => state.toggleIngredient);

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
          className={`h-20 w-20 overflow-hidden rounded-full ${isSelected ? 'border-[5px] border-green-700/80' : 'border-2 border-neutral-200'}`}>
          <Image style={{ width: '100%', height: '100%', objectFit: 'cover' }} source={image} />
        </View>
        <Text className={`h-6 w-full text-lg ${isSelected && 'font-semibold'}`}>{name}</Text>
      </View>
    </TouchableHighlight>
  );
}

export default React.memo(Ingredient);
