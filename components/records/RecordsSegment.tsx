import { Text } from 'components/common/Text';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { RecordsView } from 'utils/recordsView';

const SEGMENTS: { view: RecordsView; label: string }[] = [
  { view: 'weight', label: '체중' },
  { view: 'fasting', label: '단식' },
  { view: 'report', label: '리포트' },
];

// shadow-* 클래스는 CSS 변수를 써서, 처음 렌더 뒤에 붙이면 nativewind가 컴포넌트를 갈아끼운다
// (개발 빌드에선 그 경고를 찍다가 'navigation context' 렌더 에러로 죽음) → 그림자는 style로
const styles = StyleSheet.create({
  selected: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
});

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
            style={selected ? styles.selected : undefined}
            className={`flex-1 items-center rounded-full py-2 ${selected ? 'bg-white' : ''}`}>
            <Text className={selected ? 'font-bold text-neutral-800' : 'text-neutral-500'}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
