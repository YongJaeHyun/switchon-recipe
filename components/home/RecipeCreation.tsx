import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { recipeButtonBG } from 'const/assets';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from '../common/RippleButton';

export default function RecipeCreation() {
  return (
    <Link href={'/recipeCreation'} className="h-52 w-full shadow-xl" asChild>
      <RippleButton
        className="overflow-hidden bg-transparent"
        rippleColor={colors.neutral[400]}
        rounded="xl">
        <View className="flex-row bg-white">
          <View className="flex-[3] justify-between px-6 py-5">
            <View className="flex-row items-center gap-2">
              <Text className="text-3xl font-bold">레시피 제작</Text>
              <MaterialIcons name="arrow-forward-ios" size={24} color={colors.neutral[400]} />
            </View>
            <View>
              <Text className="text-lg">내가 가지고 있는 재료로</Text>
              <Text className="text-lg">레시피 제작!</Text>
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
