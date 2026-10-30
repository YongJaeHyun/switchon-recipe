import { StatisticsAPI } from 'api/StatisticsAPI';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { BlurView } from 'expo-blur';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import React, { useState } from 'react';
import { ActivityIndicator, TouchableWithoutFeedback, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { Nullable } from 'types/common';
import { getKoreanDateString } from 'utils/date';
import { programWeekAndDay } from 'utils/programStart';
import { getWeekColor } from 'utils/getWeekColor';

interface WeekProps {
  week: number;
  average: number;
  todoRatesByWeek: Nullable<number>[];
}

interface DayProps {
  week: number;
  day: number;
  todoRate: Nullable<number>;
}

const Week = React.memo(({ week, todoRatesByWeek, average }: WeekProps) => {
  return (
    <View className="mb-2 gap-2">
      <View className="flex-row items-center justify-between">
        <Text className={`text-lg font-bold ${getWeekColor(week)}`}>{week}주차</Text>
        {average > 0 && (
          <Text className="text-sm">
            평균 완료율: <Text className="font-bold">{average}%</Text>
          </Text>
        )}
      </View>
      <View className="mb-2 flex-row items-center justify-center gap-1">
        {todoRatesByWeek.map((todoRate, index) => {
          const day = index + 1;
          return <Day key={`statistics-day-${day}`} week={week} day={day} todoRate={todoRate} />;
        })}
      </View>
    </View>
  );
});

const Day = ({ week, day, todoRate }: DayProps) => {
  const MIN_BOOST = 5;
  const MAX_BAR_HEIGHT = 36;

  const [showBlur, setShowBlur] = useState(false);

  const start_date = useUserStore((state) => state.start_date);
  const {
    week: currentWeek,
    day: currentDay,
    beforeStart,
  } = programWeekAndDay(start_date, getKoreanDateString({ formatType: 'date' }));

  const safeRate = todoRate === null ? 0 : todoRate + MIN_BOOST;
  const barHeight = (safeRate / 100) * MAX_BAR_HEIGHT;

  // 시작 전에는 오늘 표시를 하지 않는다
  const isToday = !beforeStart && week === currentWeek && day === currentDay;

  const blurOpacity = useSharedValue(0);
  const blurStyle = useAnimatedStyle(() => ({
    opacity: blurOpacity.value,
  }));

  const appearTodoRate = () => {
    setShowBlur(true);

    blurOpacity.value = withTiming(1, { duration: 250 });
  };

  const disappearTodoRate = () => {
    blurOpacity.value = withTiming(0, { duration: 250 }, () => {
      runOnJS(() => setShowBlur(false));
    });
  };

  const handlePressDay = () => {
    appearTodoRate();

    setTimeout(() => {
      disappearTodoRate();
    }, 1500);
  };

  return (
    <TouchableWithoutFeedback onPress={handlePressDay}>
      <View
        className={`relative flex h-14 w-14 items-center justify-center rounded-full 
          ${isToday && 'bg-green-200/50'}`}>
        <Text className="absolute left-3 top-1 text-sm">{day}</Text>

        <View
          style={{ height: barHeight }}
          className="absolute bottom-1 right-3 flex-1 rounded-md border-r-8 border-green-500"
        />

        {showBlur && (
          <Animated.View
            className="absolute inset-0 z-10 overflow-hidden rounded-full border border-neutral-100"
            style={blurStyle}>
            <BlurView
              intensity={10}
              tint="light"
              experimentalBlurMethod="dimezisBlurView"
              className="absolute inset-0 rounded-full"
            />

            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-sm text-neutral-800">{todoRate}%</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

// 나의 4주 리포트: 주차별 일자 할 일 완료율 막대
export function FourWeekReport() {
  const id = useUserStore((state) => state.id);

  const { data: todoRateStatistics, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.todoRateStatistics, id],
    queryFn: StatisticsAPI.getTodoRatesByWeeks,
  });

  return (
    <View className="min-h-[30.3rem] flex-1">
      <Text className="mb-6 text-lg font-bold">나의 4주 리포트</Text>
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        todoRateStatistics?.weeks.map((statistic, index) => {
          const { average, todoRatesByWeek } = statistic;
          const week = index + 1;

          return (
            <Week
              key={`statistics-week-${week}`}
              week={week}
              average={average}
              todoRatesByWeek={todoRatesByWeek}
            />
          );
        })
      )}
    </View>
  );
}
