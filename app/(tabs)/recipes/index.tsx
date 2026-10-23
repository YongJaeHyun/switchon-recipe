import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { ExploreEntry } from 'components/recipes/ExploreEntry';
import RecentRecipes from 'components/recipes/RecentRecipes';
import RecipeCreation from 'components/recipes/RecipeCreation';
import { RecipeToolCards } from 'components/recipes/RecipeToolCards';
import SavedRecipes from 'components/recipes/SavedRecipes';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';
import { RecipeAPI } from '../../../api/RecipeAPI';

export default function RecipesScreen() {
  const initIsSavedMap = useRecipeStore((state) => state.initIsSavedMap);
  const [refreshing, setRefreshing] = useState(false);

  const { data: recentRecipes, refetch: refetchRecentRecipes } = useQueryWith402Retry({
    queryKey: [QueryKey.recentRecipes],
    queryFn: async () => {
      const recipes = (await RecipeAPI.selectAllRecent()) ?? [];
      return recipes;
    },
  });
  const { data: savedRecipes, refetch: refetchSavedRecipes } = useQueryWith402Retry({
    queryKey: [QueryKey.savedRecipes],
    queryFn: async () => {
      const recipes = (await RecipeAPI.selectAllSaved()) ?? [];
      initIsSavedMap(recipes);
      return recipes;
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchRecentRecipes(), refetchSavedRecipes()]);
    setRefreshing(false);
  }, [refetchRecentRecipes, refetchSavedRecipes]);

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 px-5">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <View className="mb-10 mt-4 gap-10">
          <View className="gap-5">
            <Pressable
              className="flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3"
              onPress={() => router.push('/(tabs)/recipes/search')}>
              <MaterialIcons name="search" size={22} color={colors.neutral[400]} />
              <Text className="text-neutral-400">레시피 검색</Text>
            </Pressable>
            <View className="flex-row gap-4">
              <RecipeCreation
                href={'/recipeCreation/zero'}
                title="무탄수"
                subtitle="단백질 & 채소로만 건강하게!"
              />
              <RecipeCreation
                href={'/recipeCreation/low'}
                title="저탄수"
                subtitle="탄수화물 추가로 포만감 있게!"
              />
            </View>
            <RecipeToolCards />
          </View>
          <SavedRecipes recipes={savedRecipes} refreshing={refreshing} />
          <RecentRecipes recipes={recentRecipes} refreshing={refreshing} />
          <ExploreEntry />
        </View>
      </ScrollView>
    </SafeAreaViewWithNav>
  );
}
