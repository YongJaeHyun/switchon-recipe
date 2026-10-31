import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from 'components/common/Text';
import { Pressable, View } from 'react-native';
import { useFirstWeekStore } from 'stores/firstWeekStore';
import { useTipSheetStore } from 'stores/tipSheetStore';
import colors from 'tailwindcss/colors';
import { isWeek1GuideDismissed, week1GuideFor } from 'utils/week1Guide';

// 1주차 1~7일 오늘 탭 할 일 카드 위의 한 줄 안내. "자세히"는 팁 시트, X는 그날(KST)만 숨김
export function Week1GuideCard({
  week,
  day,
  today,
}: {
  week: number;
  day: number;
  today: string; // KST yyyy-MM-dd
}) {
  const dismissedDay = useFirstWeekStore((state) => state.guideDismissedDay);
  const dismissGuide = useFirstWeekStore((state) => state.dismissGuide);
  const guide = week1GuideFor(week, day);

  if (!guide || isWeek1GuideDismissed(dismissedDay, today)) return null;

  const openTip = () => useTipSheetStore.getState().open(guide.tip);

  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-green-50 py-3 pl-4 pr-2">
      {/* 한 줄과 "자세히"는 한 버튼 (같은 팁 시트를 연다) */}
      <Pressable
        onPress={openTip}
        accessibilityRole="button"
        accessibilityLabel={`${day}일차 안내: ${guide.line}. 자세히 보기`}
        className="flex-1 flex-row items-center gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="text-xs font-bold text-green-700">{day}일차 안내</Text>
          <Text className="text-sm text-neutral-800">{guide.line}</Text>
        </View>
        <Text className="px-1 py-1 text-sm font-bold text-green-600">자세히</Text>
      </Pressable>
      <Pressable
        onPress={() => dismissGuide(today)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="오늘 안내 닫기"
        className="p-1">
        <Ionicons name="close" size={16} color={colors.neutral[400]} />
      </Pressable>
    </View>
  );
}
