import { selectAllSavedRecipeFromDB } from 'api/supabaseAPI';
import RecipeCard from 'components/home/RecipeCard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';

export default function SavedRecipes() {
  const [recipes, setRecipes] = useState<RecipeDB[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoading(true);

      const recipes = await selectAllSavedRecipeFromDB();
      setRecipes(recipes);

      setIsLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView className="relative mt-4 flex-1 px-5">
      <Text className="mb-2 text-3xl font-semibold">저장한 레시피</Text>
      <Text className="mb-8 text-xl font-semibold text-neutral-500">전체 {recipes.length}개</Text>
      {isLoading ? (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        <FlatList
          data={recipes}
          numColumns={2}
          contentContainerClassName="items-center gap-4"
          columnWrapperClassName="justify-between gap-4"
          renderItem={({ item }) => <RecipeCard {...item} />}
        />
      )}
    </SafeAreaView>
  );
}
