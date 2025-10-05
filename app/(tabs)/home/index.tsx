import BottomSheet from '@gorhom/bottom-sheet';
import HomeHeader from 'components/home/HomeHeader';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import { StartDateBottomSheet } from 'components/home/StartDateBottomSheet';
import { latestNotices } from 'const/notices';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RecipeAPI } from '../../../api/RecipeAPI';
import { LatestNotice } from '../../../components/home/LatestNotice';
import { useRecipeStore } from '../../../stores/recipeStore';

export default function HomeScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [refreshing, setRefreshing] = useState(false);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);
  const setSavedRecipes = useRecipeStore((state) => state.setSavedRecipes);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const [recentRecipes, savedRecipes] = await Promise.all([
      RecipeAPI.selectAllRecent(),
      RecipeAPI.selectAllSaved(),
    ]);
    setRecentRecipes(recentRecipes ?? []);
    setSavedRecipes(savedRecipes ?? []);
    setRefreshing(false);
  }, [setRecentRecipes, setSavedRecipes]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50 px-5">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <HomeHeader bottomSheetRef={bottomSheetRef} />

        <View className="my-6 border-b-2 border-neutral-300" />

        <View className="mb-10 gap-10">
          <View className="gap-5">
            <LatestNotice notices={latestNotices} />
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
          <SavedRecipes refreshing={refreshing} />
          <RecentRecipes refreshing={refreshing} />
        </View>
      </ScrollView>

      <StartDateBottomSheet bottomSheetRef={bottomSheetRef} />
    </SafeAreaView>
  );
}
