import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ListEmptyText from 'components/common/ListEmptyText';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import RecipeCard from './RecipeCard';

export default function RecentRecipes({ refreshing }: { refreshing: boolean }) {
  const recipes = useRecipeStore((state) => state.recentRecipes);
  const fetchRecentRecipes = useRecipeStore((state) => state.fetchRecentRecipes);

  useEffect(() => {
    (async () => {
      await fetchRecentRecipes();
    })();
  }, [fetchRecentRecipes]);

  return (
    <View className="">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-2xl font-semibold">최근 만든 레시피</Text>
        {recipes.length > 10 && (
          <View className="flex-row items-center">
            <Text className="text-neutral-500">더보기</Text>
            <MaterialIcons name="keyboard-arrow-right" size={20} color={colors.neutral[500]} />
          </View>
        )}
      </View>
      {refreshing ? (
        <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
      ) : (
        <FlatList
          className="h-48"
          data={recipes}
          contentContainerClassName={'gap-5'}
          keyExtractor={(item) => 'RecentRecipes' + item.id.toString()}
          renderItem={({ item }) => <RecipeCard {...item} />}
          ListEmptyComponent={<ListEmptyText emptyListName="recentRecipes" />}
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
