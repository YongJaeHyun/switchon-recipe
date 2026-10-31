import { StatisticsAPI } from 'api/StatisticsAPI';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import React from 'react';
import { View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { buildCompletionCalendar, type CalendarWeek, type DayMark } from 'utils/completionCalendar';
import { getKoreanDateString } from 'utils/date';
import { getWeekInkHex } from 'utils/getWeekColor';
import { programWeekAndDay } from 'utils/programStart';

const MARK = 16;
const CELL = 28;
const INK = colors.green[600];

const MARK_LABEL: Record<DayMark, string> = {
  full: '100%',
  partial: '일부',
  missed: '못 함',
  upcoming: '아직',
};

// ● 완주 / ◐ 일부 / ○ 못 함 / · 아직. 글리프는 글꼴마다 크기가 달라 View로 그린다
const Mark = ({ mark, size = MARK }: { mark: DayMark; size?: number }) => {
  if (mark === 'upcoming') {
    return <View className="rounded-full bg-neutral-300" style={{ width: 4, height: 4 }} />;
  }
  if (mark === 'full') {
    return (
      <View className="rounded-full" style={{ width: size, height: size, backgroundColor: INK }} />
    );
  }
  if (mark === 'partial') {
    return (
      <View
        className="overflow-hidden rounded-full"
        style={{ width: size, height: size, borderWidth: 1.5, borderColor: INK }}>
        <View className="absolute bottom-0 left-0 top-0 w-1/2" style={{ backgroundColor: INK }} />
      </View>
    );
  }
  return (
    <View
      className="rounded-full"
      style={{ width: size, height: size, borderWidth: 1.5, borderColor: colors.neutral[400] }}
    />
  );
};

const weekLabel = ({ week, counts }: CalendarWeek) => {
  const parts = [
    counts.full && `완주 ${counts.full}일`,
    counts.partial && `일부 ${counts.partial}일`,
    counts.missed && `못 함 ${counts.missed}일`,
  ].filter(Boolean);
  return `${week}주차, ${parts.length ? parts.join(', ') : '아직 기록 없음'}`;
};

const WeekRow = React.memo(({ calendarWeek }: { calendarWeek: CalendarWeek }) => (
  <View className="flex-row items-center" accessible accessibilityLabel={weekLabel(calendarWeek)}>
    <Text
      className="w-14 text-sm font-bold"
      style={{ color: getWeekInkHex(calendarWeek.week) }}
      maxFontSizeMultiplier={1.4}>
      {calendarWeek.week}주차
    </Text>
    <View className="flex-1 flex-row justify-between">
      {calendarWeek.days.map(({ day, mark, isToday }) => (
        <View
          key={day}
          className="items-center justify-center"
          style={{
            width: CELL,
            height: CELL,
            borderRadius: CELL / 2,
            borderWidth: isToday ? 1.5 : 0,
            borderColor: colors.neutral[800],
          }}>
          <Mark mark={mark} />
        </View>
      ))}
    </View>
  </View>
));

const LEGEND: DayMark[] = ['full', 'partial', 'missed', 'upcoming'];

// 나의 4주 완주 달력: 주차별 하루 할 일 완료 여부를 점으로
export function FourWeekReport() {
  const id = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);

  const { data, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.todoRateStatistics, id],
    queryFn: StatisticsAPI.getTodoRatesByWeeks,
  });

  const progress = programWeekAndDay(startDate, getKoreanDateString({ formatType: 'date' }));
  // 시작일이 없거나 시작 전이면 어떤 날도 지나지 않았다. 불러오는 중에도 빈 달력으로 자리를 잡아 둔다
  const notStarted = !startDate || progress.beforeStart;
  const calendar = buildCompletionCalendar(
    isLoading ? undefined : data?.weeks.map((w) => w.todoRatesByWeek),
    notStarted || isLoading ? { ...progress, beforeStart: true } : progress
  );

  return (
    <View className="gap-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-lg font-bold">4주 완주 달력</Text>
        {!isLoading && !notStarted && (
          <Text className="text-sm text-neutral-500">
            <Text className="font-bold text-neutral-900">{calendar.fullCount}일</Text> 완주
          </Text>
        )}
      </View>

      {notStarted && !isLoading && (
        <Text className="-mt-2 text-sm text-neutral-500">프로그램이 시작되면 하루씩 채워져요</Text>
      )}

      <View className="gap-2">
        {calendar.weeks.map((calendarWeek) => (
          <WeekRow key={calendarWeek.week} calendarWeek={calendarWeek} />
        ))}
      </View>

      <View
        className="flex-row flex-wrap items-center gap-x-4 gap-y-1"
        accessible
        accessibilityLabel="채운 점 100%, 반쪽 점 일부, 빈 원 못 함, 작은 점 아직">
        {LEGEND.map((mark) => (
          <View key={mark} className="flex-row items-center gap-1.5">
            <View className="items-center justify-center" style={{ width: 12, height: 12 }}>
              <Mark mark={mark} size={12} />
            </View>
            <Text className="text-xs text-neutral-500">{MARK_LABEL[mark]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
