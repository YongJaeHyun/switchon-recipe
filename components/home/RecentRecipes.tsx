import { selectRecentRecipeFromDB } from 'api/supabaseAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import { Text } from 'components/common/Text';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import RecipeCard from './RecipeCard';

export default function RecentRecipes({ refreshing }: { refreshing: boolean }) {
  const recipes = useRecipeStore((state) => state.recentRecipes);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);

  useEffect(() => {
    (async () => {
      const recipes = await selectRecentRecipeFromDB();
      setRecentRecipes(recipes);
    })();
  }, [setRecentRecipes]);

  return (
    <View className="">
      <Text className="mb-6 text-2xl font-bold">최근 만든 레시피</Text>
      {refreshing ? (
        <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
      ) : (
        <FlatList
          className="h-52"
          data={recipes}
          contentContainerClassName={'gap-5'}
          keyExtractor={(item) => 'RecentRecipes' + item.id.toString()}
          renderItem={({ item }) => <RecipeCard {...item} />}
          ListEmptyComponent={
            <ListEmptyText href={'/recipeCreation'} emptyListName="recentRecipes" />
          }
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
