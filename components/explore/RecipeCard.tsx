import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ImageSkeleton } from 'components/common/ImageSkeleton';
import { Text } from 'components/common/Text';
import { CarbBadge } from 'components/recipes/CarbBadge';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import { RecipeCardData, RecipeIngredient } from 'types/recipe';
import { getWeekColor } from 'utils/getWeekColor';
import { Category } from './Category';
import { HighlightText } from './HighlightText';

interface RecipeCardProps extends RecipeCardData {
  keyword?: string;
}

export const RecipeCard = React.memo(({ keyword, ...recipe }: RecipeCardProps) => {
  const { isSavedMap, toggleIsSaved } = useRecipeStore();
  const isSaved = !!isSavedMap[recipe.id];

  const parsedIngredients: RecipeIngredient[] = JSON.parse(recipe.ingredients ?? '');

  return (
    <Link
      href={`/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
      className="flex-1">
      <View
        className="w-full flex-1 overflow-hidden rounded-xl"
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
            <CarbBadge isZeroCarb={recipe.is_zero_carb} />
          </View>

          <ImageSkeleton />
          {recipe.image_uri && (
            // 목록이 카드를 재사용할 때 이전 레시피 사진이 잠깐 보이지 않도록 레시피마다 이미지를 새로 그린다
            <Image
              source={{ uri: recipe.image_uri }}
              recyclingKey={String(recipe.id)}
              transition={200}
              style={{ width: '100%', height: '100%' }}
            />
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
          <HighlightText
            className="text-lg font-bold"
            text={recipe.recipe_name ?? ''}
            keyword={keyword}
          />

          <View className="flex-row flex-wrap gap-2">
            {parsedIngredients.map((ingredient: RecipeIngredient) => {
              const isOldVersion = typeof ingredient === 'string';
              return (
                <Category
                  key={`${recipe.id}-${isOldVersion ? ingredient : ingredient.name}`}
                  recipe={recipe}
                  ingredient={ingredient}
                  keyword={keyword}
                />
              );
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
