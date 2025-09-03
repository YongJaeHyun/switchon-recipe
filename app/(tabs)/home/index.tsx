import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import CustomCalendar from 'components/common/CustomCalendar';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import HomeHeader from 'components/home/HomeHeader';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import { notices } from 'const/notices';
import useKoreanToday from 'hooks/useKoreanToday';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import { getWeekAndDay } from 'utils/date';
import { RecipeAPI } from '../../../api/RecipeAPI';
import { UserAPI } from '../../../api/UserAPI';
import { Notice } from '../../../components/home/Notice';
import { useRecipeStore } from '../../../stores/recipeStore';

export default function HomeScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const { selectedIngredients: lowIngredients, upsertIngredients: upsertLowIngredients } =
    useSelectedIngredients({ type: 'low' });
  const { selectedIngredients: zeroIngredients, upsertIngredients: upsertZeroIngredients } =
    useSelectedIngredients({ type: 'zero' });

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
    const { week } = getWeekAndDay(selectedDate);

    const filteredLowIngredients = lowIngredients.filter((ingredient) => ingredient.week <= week);
    if (lowIngredients.length !== filteredLowIngredients.length) {
      upsertLowIngredients(filteredLowIngredients);
    }

    const filteredZeroIngredients = zeroIngredients.filter((ingredient) => ingredient.week <= week);
    if (zeroIngredients.length !== filteredZeroIngredients.length) {
      upsertZeroIngredients(filteredZeroIngredients);
    }

    await UserAPI.updateStartDate(selectedDate);

    if (bottomSheetRef) {
      bottomSheetRef.current?.close();
    }
  };

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
            <Notice notices={notices} />
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

      <CustomBottomSheet ref={bottomSheetRef}>
        <BottomSheetView className="px-5">
          <View className="flex-row items-center justify-between">
            <Text className="mb-2 text-2xl font-bold">시작 날짜 재설정</Text>
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
          <RippleButton
            outerClassName="mb-10"
            className="w-full bg-green-600 py-4"
            onPress={updateStartDate}>
            <Text className="text-lg font-semibold text-white">날짜 재설정하기</Text>
          </RippleButton>
        </BottomSheetView>
      </CustomBottomSheet>
    </SafeAreaView>
  );
}
