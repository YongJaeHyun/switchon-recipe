import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { IngredientSchema } from 'types/recipe';
import { getWeekColor } from 'utils/getWeekColor';
import { z } from 'zod';

type RecipeIngredient = string | z.infer<typeof IngredientSchema>;

export const RecipeCard = React.memo((recipe: RecipeDB) => {
  const { isSavedMap, toggleIsSaved } = useRecipeStore();
  const isSaved = !!isSavedMap[recipe.id];

  const parsedIngredients: RecipeIngredient[] = JSON.parse(recipe.ingredients ?? '');

  return (
    <Link
      href={`/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
      className="flex-1">
      <View
        className="w-full overflow-hidden rounded-xl"
        style={{
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.5,
          shadowRadius: 2,
          elevation: 2,
        }}>
        <View className="relative h-48">
          <View className="absolute left-2 top-2 z-50 flex-row gap-1.5">
            {recipe.week && (
              <View className={`rounded-full bg-white px-2 py-1`}>
                <Text className={`text-sm ${getWeekColor(recipe.week)}`}>
                  {recipe.week}주차{recipe.week === 3 && '+'}
                </Text>
              </View>
            )}
            <View className={`rounded-full bg-white px-2 py-1`}>
              <Text className="text-sm text-neutral-500">
                {recipe.is_zero_carb ? '무탄수' : '저탄수'}
              </Text>
            </View>
          </View>

          {recipe.image_uri && (
            <Image source={{ uri: recipe.image_uri }} style={{ width: '100%', height: '100%' }} />
          )}

          <Pressable
            onPress={() => toggleIsSaved(recipe.id)}
            className="absolute right-2 top-2 z-50 items-center justify-center">
            <View className="flex-1 flex-row items-center justify-center gap-1 rounded-full bg-black/30 px-2 py-1">
              <MaterialIcons
                name={isSaved ? 'star' : 'star-outline'}
                size={26}
                color={colors.yellow[500]}
              />
              <Text className="text-medium text-white">
                {recipe.saved_count + (isSaved ? 1 : 0)}
              </Text>
            </View>
          </Pressable>
        </View>
        <View className="justify-evenly gap-3 bg-white p-3">
          <Text className="line-clamp-1 text-lg font-bold">{recipe.recipe_name}</Text>

          <View className="flex-row flex-wrap gap-2">
            {parsedIngredients.map((item: RecipeIngredient) => {
              const isOldVersion = typeof item === 'string';
              const ingredientName = isOldVersion ? item : item.name;

              if (isOldVersion || !ingredientName.length) {
                return (
                  <View
                    key={`${recipe.recipe_name}-${ingredientName}`}
                    className="rounded-full bg-neutral-200 px-3 py-1 opacity-60">
                    <Text className="text-sm font-semibold">{ingredientName}</Text>
                  </View>
                );
              } else {
                return (
                  <Link
                    key={`${recipe.recipe_name}-${ingredientName}`}
                    href={`/(tabs)/explore/searchResult?keyword=${ingredientName}`}
                    asChild>
                    <RippleButton
                      rippleColor={colors.neutral[300]}
                      className="bg-neutral-200 px-3 py-1"
                      rounded="full">
                      <Text className="text-sm font-semibold">{ingredientName}</Text>
                    </RippleButton>
                  </Link>
                );
              }
            })}
          </View>

          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={16} color="black" />
            <Text className="text-sm">약 {recipe.cooking_time}분</Text>
          </View>
        </View>
      </View>
    </Link>
  );
});
