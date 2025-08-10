import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { recipeButtonBG } from 'const/assets';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from '../common/RippleButton';

export default function RecipeCreation() {
  const { prefetch } = useSelectedIngredients();

  useEffect(() => {
    (async () => await prefetch())();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Link href={'/recipeCreation'} className="h-52 w-full shadow-xl" asChild>
      <RippleButton
        className="overflow-hidden bg-transparent"
        rippleColor={colors.neutral[400]}
        rounded="xl">
        <View className="flex-row bg-white">
          <View className="flex-[3] justify-between px-6 py-5">
            <View className="flex-row items-center gap-2.5">
              <Text className="text-3xl font-bold">레시피 제작</Text>
              <MaterialIcons name="arrow-forward-ios" size={26} color={colors.neutral[400]} />
            </View>
            <View>
              <Text className="text-lg font-semibold">내가 가지고 있는 재료로</Text>
              <Text className="text-lg font-semibold">레시피 제작!</Text>
            </View>
          </View>
          <View className="h-full w-full flex-[2]">
            <Image style={{ width: '100%', height: '100%' }} source={recipeButtonBG} />
          </View>
        </View>
      </RippleButton>
    </Link>
  );
}
