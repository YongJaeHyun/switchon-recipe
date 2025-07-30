import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { selectSavedRecipeFromDB } from 'api/supabaseAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import { Link } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import RecipeCard from './RecipeCard';

export default function SavedRecipes({ refreshing }: { refreshing: boolean }) {
  const recipes = useRecipeStore((state) => state.savedRecipes);
  const setSavedRecipes = useRecipeStore((state) => state.setSavedRecipes);

  useEffect(() => {
    (async () => {
      const recipes = await selectSavedRecipeFromDB();
      setSavedRecipes(recipes);
    })();
  }, [setSavedRecipes]);

  return (
    <View className="">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-2xl font-semibold">저장한 레시피</Text>
        <Link href={'/(tabs)/home/savedRecipes'}>
          <View className="flex-row items-center">
            <Text className="text-neutral-500">모두보기</Text>
            <MaterialIcons name="keyboard-arrow-right" size={20} color={colors.neutral[500]} />
          </View>
        </Link>
      </View>

      {refreshing ? (
        <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
      ) : (
        <FlatList
          className="h-52"
          data={recipes}
          contentContainerClassName={'gap-5'}
          keyExtractor={(item) => 'SavedRecipes' + item.id.toString()}
          renderItem={({ item }) => <RecipeCard {...item} />}
          ListEmptyComponent={
            <ListEmptyText href={'/recipeCreation'} emptyListName="savedRecipes" />
          }
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
