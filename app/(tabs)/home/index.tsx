import BottomSheet from '@gorhom/bottom-sheet';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { HomeHeader } from 'components/home/HomeHeader';
import { StartDateBottomSheet } from 'components/home/StartDateBottomSheet';
import { TodayChecklist } from 'components/home/TodayChecklist';
import { getLatestNotices } from 'const/notices';
import { QueryKey } from 'const/queryKey';
import { useIngredients } from 'hooks/useIngredients';
import { queryClient } from 'lib/queryClient';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { LatestNotice } from '../../../components/home/LatestNotice';

// 당겨서 새로고침: 오늘 탭에 보이는 것(할 일·단식·체중·공지)만 다시 불러온다
const REFRESH_KEYS = [
  QueryKey.todos,
  QueryKey.fasting,
  QueryKey.fastingPlan,
  QueryKey.fastingResult,
  QueryKey.weightLogs,
  QueryKey.ingredients,
];

export default function HomeScreen() {
  const { latestNotice } = useIngredients();

  const bottomSheetRef = useRef<BottomSheet>(null);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // 오프라인 등으로 실패해도 화면을 막지 않는다 (refetchQueries는 실패해도 던지지 않음)
    await Promise.allSettled(
      REFRESH_KEYS.map((key) => queryClient.refetchQueries({ queryKey: [key], type: 'active' }))
    );
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 px-5">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <HomeHeader bottomSheetRef={bottomSheetRef} />

        <View className="my-6 border-b-2 border-neutral-300" />

        <View className="mb-10 gap-5">
          <LatestNotice notices={getLatestNotices(latestNotice)} />
          <TodayChecklist />
        </View>
      </ScrollView>

      <StartDateBottomSheet bottomSheetRef={bottomSheetRef} />
    </SafeAreaViewWithNav>
  );
}
