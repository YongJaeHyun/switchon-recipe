import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, TouchableHighlight, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { IngredientProps } from 'types/recipe';

export default function Ingredient({ name, image }: IngredientProps) {
  const [isSelected, setIsSelected] = useState(false);

  const toggleSelect = () => {
    console.log(isSelected);
    setIsSelected((prev) => !prev);
  };
  return (
    <TouchableHighlight
      className="h-32 w-24 items-center justify-center rounded-lg"
      onPress={toggleSelect}
      underlayColor={colors.neutral[200]}>
      <View className="items-center gap-1">
        <View
          className={`h-20 w-20 overflow-hidden rounded-full ${isSelected ? 'border-[3px] border-green-500' : 'border-2 border-neutral-200'}`}>
          <Image style={{ width: '100%', height: '100%', objectFit: 'cover' }} source={image} />
        </View>
        <Text className="h-6 w-full text-lg">{name}</Text>
      </View>
    </TouchableHighlight>
  );
}
