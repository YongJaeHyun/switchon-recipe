import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { FastingHistorySection } from 'components/records/FastingHistorySection';
import { RecordsSegment } from 'components/records/RecordsSegment';
import { ReportSection } from 'components/records/ReportSection';
import { WeightSection } from 'components/records/WeightSection';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { parseRecordsView, type RecordsView } from 'utils/recordsView';

export default function RecordsScreen() {
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const view = parseRecordsView(viewParam);

  const changeView = (next: RecordsView) => {
    if (next !== view) router.setParams({ view: next });
  };

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50">
      <View className="gap-4 px-5 pb-4 pt-4">
        <Text className="text-2xl font-bold">기록</Text>
        <RecordsSegment value={view} onChange={changeView} />
      </View>
      {view === 'weight' && <WeightSection />}
      {view === 'fasting' && <FastingHistorySection />}
      {view === 'report' && <ReportSection />}
    </SafeAreaViewWithNav>
  );
}
