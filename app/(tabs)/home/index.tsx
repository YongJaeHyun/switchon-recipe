import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { selectRecentRecipeFromDB, selectSavedRecipeFromDB } from 'api/supabaseAPI';
import CustomCalendar from 'components/common/CustomCalendar';
import HomeHeader from 'components/home/HomeHeader';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { useRecipeStore } from '../../../stores/recipeStore';

export default function HomeScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [refreshing, setRefreshing] = useState(false);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);
  const setSavedRecipes = useRecipeStore((state) => state.setSavedRecipes);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const [recentRecipes, savedRecipes] = await Promise.all([
      selectRecentRecipeFromDB(),
      selectSavedRecipeFromDB(),
    ]);
    setRecentRecipes(recentRecipes);
    setSavedRecipes(savedRecipes);
    setRefreshing(false);
  }, [setRecentRecipes, setSavedRecipes]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100 px-5">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <HomeHeader bottomSheetRef={bottomSheetRef} />

        <View
          className="my-6"
          style={{ borderBottomWidth: 2, borderBottomColor: colors.neutral[400] }}
        />

        <View className="gap-12">
          <RecipeCreation />
          <SavedRecipes refreshing={refreshing} />
          <RecentRecipes refreshing={refreshing} />
        </View>
      </ScrollView>

      <BottomSheet ref={bottomSheetRef} index={-1} snapPoints={['70%']} enablePanDownToClose>
        <BottomSheetView className="px-5">
          <CustomCalendar bottomSheetRef={bottomSheetRef} />
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
