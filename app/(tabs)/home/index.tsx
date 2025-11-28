import BottomSheet from '@gorhom/bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { HomeHeader } from 'components/home/HomeHeader';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import { StartDateBottomSheet } from 'components/home/StartDateBottomSheet';
import { WeekGuide } from 'components/home/Todos';
import { latestNotices } from 'const/notices';
import { QueryKey } from 'const/queryKey';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRecipeStore } from 'stores/recipeStore';
import { RecipeAPI } from '../../../api/RecipeAPI';
import { LatestNotice } from '../../../components/home/LatestNotice';

export default function HomeScreen() {
  const initIsSavedMap = useRecipeStore((state) => state.initIsSavedMap);

  const bottomSheetRef = useRef<BottomSheet>(null);

  const [refreshing, setRefreshing] = useState(false);

  const { data: recentRecipes, refetch: refetchRecentRecipes } = useQuery({
    queryKey: [QueryKey.recentRecipes],
    queryFn: async () => {
      const recipes = (await RecipeAPI.selectAllRecent()) ?? [];
      return recipes;
    },
  });
  const { data: savedRecipes, refetch: refetchSavedRecipes } = useQuery({
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
        <HomeHeader bottomSheetRef={bottomSheetRef} />

        <View className="my-6 border-b-2 border-neutral-300" />

        <View className="mb-10 gap-10">
          <View className="gap-5">
            <LatestNotice notices={latestNotices} />
            <WeekGuide />
            <View className="flex-row gap-4">
              <RecipeCreation
                href={'/home/recipeCreation/zero'}
                title="무탄수"
                subtitle="단백질 & 채소로만 건강하게!"
              />
              <RecipeCreation
                href={'/home/recipeCreation/low'}
                title="저탄수"
                subtitle="탄수화물 추가로 포만감 있게!"
              />
            </View>
          </View>
          <SavedRecipes recipes={savedRecipes ?? []} refreshing={refreshing} />
          <RecentRecipes recipes={recentRecipes ?? []} refreshing={refreshing} />
        </View>
      </ScrollView>

      <StartDateBottomSheet bottomSheetRef={bottomSheetRef} />
    </SafeAreaViewWithNav>
  );
}
