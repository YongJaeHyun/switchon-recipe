import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { recipeButtonBG } from 'utils/assets';

export default function RecipeCreation() {
  return (
    <Link href={'/recipeCreation'} className="h-52 w-full">
      <View className="flex-row overflow-hidden rounded-xl bg-white shadow-lg">
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
    </Link>
  );
}
