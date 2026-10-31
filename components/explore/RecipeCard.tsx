import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ImageSkeleton } from 'components/common/ImageSkeleton';
import { Text } from 'components/common/Text';
import { CarbInfo } from 'components/recipes/CarbInfo';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import { RecipeCardData, RecipeIngredient } from 'types/recipe';
import { carbTypeStyle } from 'utils/carbType';
import { getWeekColor } from 'utils/getWeekColor';
import { Category } from './Category';
import { HighlightText } from './HighlightText';

interface RecipeCardProps extends RecipeCardData {
  keyword?: string;
}

export const RecipeCard = React.memo(({ keyword, ...recipe }: RecipeCardProps) => {
  const { isSavedMap, toggleIsSaved } = useRecipeStore();
  const isSaved = !!isSavedMap[recipe.id];
  const carbType = carbTypeStyle(recipe.is_zero_carb);

  const parsedIngredients: RecipeIngredient[] = JSON.parse(recipe.ingredients ?? '');

  return (
    <Link
      href={`/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
      className="flex-1">
      {/* 카드 전체를 저탄수·무탄수 색 테두리와 같은 색 그림자로 감싼다 (상세 화면 제목 상자와 같은 방식).
          iOS는 overflow-hidden이면 그림자가 잘리므로 바깥은 테두리·그림자만, 사진은 안쪽에서 둥글게 자른다 */}
      <View
        className={`w-full flex-1 rounded-xl border-2 bg-white ${carbType.border}`}
        style={{
          shadowColor: carbType.hex,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 4,
        }}>
        {/* 테두리(2dp) 안쪽 모서리에 맞춰 사진을 rounded-xl(12)보다 2 작은 반지름으로 자른다 */}
        <View className="relative h-48 overflow-hidden rounded-t-[10px]">
          <View className="absolute left-2 top-2 z-50">
            {recipe.week && (
              <View className={`rounded-full bg-white px-2 py-1`}>
                <Text className={`text-sm ${getWeekColor(recipe.week)}`}>
                  {recipe.week}주차{recipe.week === 3 && '+'}
                </Text>
              </View>
            )}
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
        <View className="justify-evenly gap-3 rounded-b-[10px] bg-white p-3">
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

          <CarbInfo isZeroCarb={recipe.is_zero_carb} cookingTime={recipe.cooking_time} />
        </View>
      </View>
    </Link>
  );
});
