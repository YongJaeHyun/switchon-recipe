import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { RecordsSegment } from 'components/records/RecordsSegment';
import { ReportSection } from 'components/records/ReportSection';
import { WeightSection } from 'components/records/WeightSection';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { parseRecordsView, type RecordsView } from 'utils/recordsView';

// 단식 칸: Task 5에서 단식 기록 목록으로 채운다
const FastingPlaceholder = () => (
  <View className="flex-1 items-center px-5 pt-10">
    <Text className="text-neutral-500">곧 이곳에서 단식 기록을 볼 수 있어요.</Text>
  </View>
);

export default function RecordsScreen() {
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const view = parseRecordsView(viewParam);

  const changeView = (next: RecordsView) => {
    if (next !== view) router.setParams({ view: next });
  };

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50">
      <View className="gap-4 px-5 pb-4 pt-4">
        <Text className="text-xl font-bold">기록</Text>
        <RecordsSegment value={view} onChange={changeView} />
      </View>
      {view === 'weight' && <WeightSection />}
      {view === 'fasting' && <FastingPlaceholder />}
      {view === 'report' && <ReportSection />}
    </SafeAreaViewWithNav>
  );
}
