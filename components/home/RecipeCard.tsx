import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { deleteSavedRecipeFromDB, insertSavedRecipeToDB } from 'api/supabaseAPI';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { getWeekColor } from 'utils/getWeekColor';

export default function RecipeCard(recipe: RecipeDB) {
  const [isSaved, setIsSaved] = useState<boolean>(recipe?.is_saved ?? false);
  const timer = useRef<NodeJS.Timeout>(null);

  const toggleIsSaved = () => {
    const next = !isSaved;
    setIsSaved(next);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      if (next) {
        await insertSavedRecipeToDB(recipe.id);
      } else {
        await deleteSavedRecipeFromDB(recipe.id);
      }
      timer.current = null;
    }, 500);
  };
  return (
    <Link
      href={`/(tabs)/home/recipeDetail?recipe=${JSON.stringify({ ...recipe, isSaved })}`}
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
          <View className={`absolute left-2 top-2 z-50 rounded-full bg-white px-2 py-1`}>
            <Text className={`${getWeekColor(recipe.week)}`}>
              {recipe.week}주차{recipe.week === 3 && '+'}
            </Text>
          </View>

          <Image source={{ uri: recipe.image_uri }} style={{ width: '100%', height: '100%' }} />

          <Pressable
            onPress={toggleIsSaved}
            className="absolute right-2 top-2 z-50 h-10 w-10 items-center justify-center">
            <View className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30" />
            <MaterialIcons
              name={isSaved ? 'star' : 'star-outline'}
              size={30}
              color={colors.yellow[500]}
            />
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
