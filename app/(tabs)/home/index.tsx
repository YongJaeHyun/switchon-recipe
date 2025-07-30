import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import {
  selectRecentRecipeFromDB,
  selectSavedRecipeFromDB,
  updateStartDateToDB,
} from 'api/supabaseAPI';
import CustomCalendar from 'components/common/CustomCalendar';
import RippleButton from 'components/common/RippleButton';
import HomeHeader from 'components/home/HomeHeader';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import useKoreanToday from 'hooks/useKoreanToday';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIngredientStore } from 'stores/ingredientStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getWeekAndDay } from 'utils/date';
import { useRecipeStore } from '../../../stores/recipeStore';

export default function HomeScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [refreshing, setRefreshing] = useState(false);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);
  const setSavedRecipes = useRecipeStore((state) => state.setSavedRecipes);

  const today = useKoreanToday();
  const startDate = useUserStore((state) => state.start_date);
  const [calendarKey, setCalendarKey] = useState(false); // 캘린더 리렌더링용 키
  const [selectedDate, setSelectedDate] = useState<string>(startDate ?? today);

  const setDateToToday = () => {
    setSelectedDate(today);
    setCalendarKey((prev) => !prev);
  };

  const updateStartDate = async () => {
    const setIngredients = useIngredientStore.getState().setIngredients;
    const selectedIngredients = useIngredientStore.getState().selectedIngredients;

    const { week } = getWeekAndDay(selectedDate);

    const filteredIngredients = selectedIngredients.filter((ingredient) => ingredient.week <= week);
    setIngredients(filteredIngredients);
    await updateStartDateToDB(selectedDate);

    if (bottomSheetRef) {
      bottomSheetRef.current.close();
    }
  };

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

        <View className="gap-10">
          <RecipeCreation />
          <SavedRecipes refreshing={refreshing} />
          <RecentRecipes refreshing={refreshing} />
        </View>
      </ScrollView>

      <BottomSheet ref={bottomSheetRef} index={-1} snapPoints={['70%']} enablePanDownToClose>
        <BottomSheetView className="px-5">
          <View className="flex-row items-center justify-between">
            <Text className="mb-2 text-2xl font-semibold">시작 날짜 재설정</Text>
            <TouchableOpacity
              className="rounded-lg border border-green-600 px-3 py-2.5"
              onPress={setDateToToday}>
              <Text className="text-green-600">오늘로 설정</Text>
            </TouchableOpacity>
          </View>
          <Text className="mb-6 text-neutral-500">날짜를 선택해주세요</Text>
          <CustomCalendar
            calendarKey={String(calendarKey)}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
          <RippleButton className="bg-green-600 py-4" onPress={updateStartDate}>
            <Text className="text-lg font-semibold text-white">날짜 재설정하기</Text>
          </RippleButton>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}
