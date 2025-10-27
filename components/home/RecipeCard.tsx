import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { getWeekColor } from 'utils/getWeekColor';
import { RecipeAPI } from '../../api/RecipeAPI';

export function RecipeCard(recipe: RecipeDB) {
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const timer = useRef<NodeJS.Timeout>(null);

  const toggleIsSaved = () => {
    const next = !isSaved;
    setIsSaved(next);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      if (next) {
        await RecipeAPI.insertSaved(recipe.id);
      } else {
        await RecipeAPI.deleteSaved(recipe.id);
      }
      timer.current = null;
    }, 500);
  };

  useEffect(() => {
    setIsSaved(recipe.is_saved);
  }, [recipe]);
  return (
    <Link
      href={`/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
      className="h-48 w-48">
      <View
        className="w-full flex-1 overflow-hidden rounded-xl"
        style={{
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.5,
          shadowRadius: 2,
          elevation: 2,
        }}>
        <View className="relative h-full w-full flex-[5]">
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
            onPress={toggleIsSaved}
            className="absolute right-2 top-2 z-50 items-center justify-center">
            <View className="flex-1 flex-row items-center justify-center gap-1 rounded-full bg-black/30 p-1">
              <MaterialIcons
                name={isSaved ? 'star' : 'star-outline'}
                size={28}
                color={colors.yellow[500]}
              />
            </View>
          </Pressable>
        </View>
        <View className="flex-[3] justify-evenly bg-white px-3">
          <Text className="line-clamp-1 text-lg font-bold">{recipe.recipe_name}</Text>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={16} color="black" />
            <Text className="text-sm">약 {recipe.cooking_time}분</Text>
          </View>
        </View>
      </View>
    </Link>
  );
}
