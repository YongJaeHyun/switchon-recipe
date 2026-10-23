import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Text } from 'components/common/Text';
import { useFasting, useFastingAlarmSync } from 'hooks/useFasting';
import { useFastingPlanBackfill, useFastingWeekContext } from 'hooks/useFastingPlan';
import { useFastingResult } from 'hooks/useFastingResult';
import { useTodos } from 'hooks/useTodos';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import AnimatedNumbers from 'react-native-animated-numbers';
import { Easing } from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getWeekAndDay } from 'utils/date';
import { getFastingStatus, WEEK_CHANGES } from 'utils/dietGuide';
import { fastingDayOf } from 'utils/fastingEarlyEnd';
import { getWeekColor, getWeekColorHex } from 'utils/getWeekColor';
import { todayExtraRows, weekStepLabel } from 'utils/todayRows';
import { FastingDayLine } from './FastingDayLine';
import { FastingProgressLine } from './FastingProgressLine';
import { FastingResultRow } from './FastingResultRow';
import { TipBottomSheet } from './TipBottomSheet';
import { Todo } from './Todo';
import { WeightRow } from './WeightRow';

const MINUTE_MS = 60 * 1000;

// 오늘 탭의 할 일 목록 하나: (단식 중이면 남은 시간 줄) → 식단 할 일 → 단식 결과 → 체중 → (아래) 단식 요일.
// 진행 중에 일찍 끝냈으면 남은 시간 줄 자리에 그 단식의 결과 카드 (할 일 목록은 그대로).
// 완료율(%)은 식단 할 일만 센다
export function TodayChecklist() {
  const startDate = useUserStore((state) => state.start_date);

  // 화면에 하나뿐이라 여기서 못 보낸 todo_daily 다시 보내기를 켠다
  const { todos, completedRate, isLoading: isTodosLoading } = useTodos({ syncTodoDaily: true });
  const { days, schedule, isLoading: isFastingLoading } = useFasting();
  const weekContext = useFastingWeekContext();
  useFastingPlanBackfill();
  useFastingAlarmSync();
  const isLoading = isTodosLoading || isFastingLoading;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const { week, day } = getWeekAndDay(startDate);
  const stepLabel = weekStepLabel(week, day);
  const isMaintenance = week >= 5;
  const status = getFastingStatus(now, schedule, weekContext);
  // 진행 중인 단식에 이미 결과가 있으면(일찍 끝냈어요) 진행 줄 대신 결과 줄
  const currentFastDay =
    week >= 2 && status.phase === 'fasting' ? fastingDayOf(status.startsAt) : null;
  const { result: currentFastResult } = useFastingResult(currentFastDay);
  const rows = todayExtraRows({
    week,
    now,
    fastingDays: days,
    schedule,
    weekContext,
    currentFastAnswered: currentFastResult !== null,
  });

  return (
    <View className="gap-3">
      {((rows.fastingProgress && status.phase === 'fasting') ||
        (rows.fastingUpcoming && status.phase === 'upcoming')) && (
        <FastingProgressLine status={status} />
      )}

      {rows.fastingEndedEarlyDay && (
        <View className="rounded-xl bg-green-50 px-4 pt-1">
          <FastingResultRow
            key={rows.fastingEndedEarlyDay}
            day={rows.fastingEndedEarlyDay}
            now={now}
            cancelable
          />
        </View>
      )}

      {rows.fastingDayLine === 'unset' && (
        <FastingDayLine state="unset" week={week} days={days} schedule={schedule} />
      )}

      <View className="rounded-xl border border-neutral-200 bg-white px-4 pb-2 pt-4">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-neutral-800">
            오늘 할 일{stepLabel && <Text className="text-sm text-neutral-500"> {stepLabel}</Text>}
          </Text>
          {todos.length > 0 && (
            <View className="flex-row items-center gap-1">
              {completedRate === 100 && (
                <FontAwesome5 name="trophy" size={14} color={colors.yellow[500]} />
              )}
              <AnimatedNumbers
                animateToNumber={completedRate}
                easing={Easing.elastic(1)}
                animationDuration={1250}
                fontStyle={{
                  fontSize: 18,
                  lineHeight: 24,
                  fontWeight: 'bold',
                  color: getWeekColorHex(week),
                }}
              />
              <Text className={`text-lg font-bold ${getWeekColor(week)}`}>%</Text>
            </View>
          )}
        </View>

        {isMaintenance && (
          <View className="my-2 gap-1 rounded-xl bg-neutral-100 p-4">
            <Text className="font-bold text-neutral-700">유지기 가이드</Text>
            {WEEK_CHANGES[5].map((line) => (
              <Text key={line} className="text-sm text-neutral-600">
                • {line}
              </Text>
            ))}
          </View>
        )}

        {isLoading && !isMaintenance ? (
          <ActivityIndicator className="h-24" size="large" color={colors.green[500]} />
        ) : (
          <FlatList
            data={todos}
            renderItem={({ item }) => <Todo {...item} />}
            keyExtractor={(item) => `todo-${item.id}`}
            scrollEnabled={false}
          />
        )}

        {rows.fastingResultDay && (
          <FastingResultRow key={rows.fastingResultDay} day={rows.fastingResultDay} now={now} />
        )}
        {rows.weight && <WeightRow />}
      </View>

      {rows.fastingDayLine === 'set' && (
        <FastingDayLine state="set" week={week} days={days} schedule={schedule} />
      )}

      <TipBottomSheet />
    </View>
  );
}
