import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ImageSkeleton } from 'components/common/ImageSkeleton';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import { RecipeWithIsSavedDB } from 'types/database';
import { carbTypeStyle } from 'utils/carbType';
import { CarbInfo } from './CarbInfo';
import { WeekPill } from './WeekPill';

interface RecipeCardProps extends RecipeWithIsSavedDB {
  // 상세 화면에서 다른 레시피 상세로 갈 때: 같은 화면이면 Link 기본 동작(navigate)이 새 화면을 쌓지 않고
  // 현재 화면의 params만 바꾸므로, 쌓아서 뒤로 가기로 돌아올 수 있게 push한다
  push?: boolean;
}

export function RecipeCard({ push, ...recipe }: RecipeCardProps) {
  const { isSavedMap, toggleIsSaved } = useRecipeStore();
  if (!recipe.id) return;

  const id = recipe.id;
  const savedCount = recipe.saved_count ?? 0;
  const isSaved = !!isSavedMap[recipe.id];
  const carbType = carbTypeStyle(recipe.is_zero_carb);
  return (
    <Link
      href={`/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
      push={push}
      className="h-48 w-48">
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
        <View className="relative h-full w-full flex-[5] overflow-hidden rounded-t-[10px]">
          <View className="absolute left-2 top-2 z-50">
            {recipe.week && <WeekPill week={recipe.week} />}
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
            onPress={() => toggleIsSaved(id)}
            className="absolute right-2 top-2 z-50 items-center justify-center">
            <View className="flex-1 flex-row items-center justify-center gap-1 rounded-full bg-black/30 px-2 py-1">
              <MaterialIcons
                name={isSaved ? 'star' : 'star-outline'}
                size={22}
                color={colors.yellow[500]}
              />
              <Text className="text-white">{savedCount + (isSaved ? 1 : 0)}</Text>
            </View>
          </Pressable>
        </View>
        <View className="flex-[3] justify-evenly rounded-b-[10px] bg-white px-3">
          <Text className="line-clamp-1 text-lg font-bold">{recipe.recipe_name}</Text>
          <CarbInfo isZeroCarb={recipe.is_zero_carb} cookingTime={recipe.cooking_time} />
        </View>
      </View>
    </Link>
  );
}
