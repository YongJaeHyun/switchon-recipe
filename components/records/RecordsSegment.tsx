import { Text } from 'components/common/Text';
import { TouchableOpacity, View } from 'react-native';
import type { RecordsView } from 'utils/recordsView';

const SEGMENTS: { view: RecordsView; label: string }[] = [
  { view: 'weight', label: '체중' },
  { view: 'fasting', label: '단식' },
  { view: 'report', label: '리포트' },
];

// 기록 탭 위쪽 3칸 전환
export function RecordsSegment({
  value,
  onChange,
}: {
  value: RecordsView;
  onChange(view: RecordsView): void;
}) {
  return (
    <View className="flex-row rounded-full bg-neutral-100 p-1">
      {SEGMENTS.map(({ view, label }) => {
        const selected = value === view;
        return (
          <TouchableOpacity
            key={view}
            onPress={() => onChange(view)}
            className={`flex-1 items-center rounded-full py-2 ${selected ? 'bg-white shadow-sm' : ''}`}>
            <Text className={selected ? 'font-bold text-neutral-800' : 'text-neutral-500'}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
