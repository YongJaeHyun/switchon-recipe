import { useMutation } from '@tanstack/react-query';
import { StatisticsAPI } from 'api/StatisticsAPI';
import { TodoAPI } from 'api/TodoAPI';
import { TodoDailyAPI } from 'api/TodoDailyAPI';
import { BASE_TODOS } from 'const/baseTodos';
import { FASTING_DAYS, FASTING_START_TIMES } from 'const/fastingDays';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { Todo } from 'types/todo';
import { getKoreanDate, getKoreanDateString, getWeekAndDay } from 'utils/date';
import { orEmptyArray } from 'utils/stableDefaults';
import { todoDailySnapshot } from 'utils/todoDaily';
import { useQueryWith402Retry } from './useCustomQuery';
import { useFasting } from './useFasting';

// 그날 첫 스냅샷을 이미 보냈는지 (useTodos는 할 일마다 불리므로 모듈 단위로 한 번만)
let snapshotSentKey: string | null = null;

// 빠르게 여러 번 체크하면 요청 도착 순서가 뒤바뀔 수 있어, 마지막 상태만 잠깐 뒤에 보낸다
const TODO_DAILY_DEBOUNCE_MS = 500;
let todoDailyTimer: ReturnType<typeof setTimeout> | null = null;

const queueTodoDailyUpsert = (body: Parameters<typeof TodoDailyAPI.upsert>[0]) => {
  if (todoDailyTimer) clearTimeout(todoDailyTimer);
  todoDailyTimer = setTimeout(() => {
    todoDailyTimer = null;
    void TodoDailyAPI.upsert(body);
  }, TODO_DAILY_DEBOUNCE_MS);
};

export const useTodos = () => {
  const userId = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);

  const { week, day } = getWeekAndDay(startDate);
  const currentStep = week === 1 ? (day <= 3 ? 1 : 2) : week + 1;

  const {
    days: fastingDays,
    startTime: fastingStartTime,
    isLoading: isFastingLoading,
  } = useFasting();
  const fastingNextDays = useMemo(
    () => fastingDays.map((day) => (day + 1) % FASTING_DAYS.length),
    [fastingDays]
  );

  const baseTodos = useMemo(
    () =>
      BASE_TODOS[currentStep]?.map((todo, idx) => ({
        id: idx,
        value: todo,
        checked: false,
      })) ?? [],
    [currentStep]
  );

  const [todos, setTodos] = useState<Todo[]>([]);
  const [completedRate, setCompletedRate] = useState(0);

  const { data, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.todos, userId],
    queryFn: TodoAPI.selectOne,
    enabled: !!userId,
  });
  // 오프라인 등으로 조회가 실패하면 data가 없음. 매번 새 [] 를 만들면 아래 useEffect가 무한 반복됨
  const checkedIds = orEmptyArray(data);

  const { mutate: resetTodos } = useMutation({
    mutationFn: () => TodoAPI.reset(),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: [QueryKey.todos, userId],
      });

      const previousData = queryClient.getQueryData<number[]>([QueryKey.todos, userId]) || [];

      queryClient.setQueryData([QueryKey.todos, userId], []);

      return { previousData };
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.todos, userId], context.previousData);
      }
    },
  });

  const { mutate: upsertTodo } = useMutation({
    mutationFn: (checkedIds: number[]) => TodoAPI.upsert(checkedIds),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.todos, userId] });

      const previousData = queryClient.getQueryData<number[]>([QueryKey.todos, userId]) || [];

      queryClient.setQueryData([QueryKey.todos, userId], () => newData);

      return { previousData };
    },
    onSuccess: (data) => {
      const checkedIds = data?.checked_ids ?? [];
      const completedRate = Math.round((checkedIds.length / baseTodos.length) * 100);

      StatisticsAPI.upsert(completedRate);
      queryClient.cancelQueries({ queryKey: [QueryKey.todoRateStatistics, userId] });
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.todos, userId], context.previousData);
      }
    },
  });

  const toggleChecked = (todoId: number) => {
    const checkedIds = queryClient.getQueryData<number[]>([QueryKey.todos, userId]) || [];

    const isChecked = checkedIds.includes(todoId);

    const updatedCheckedIds = isChecked
      ? checkedIds.filter((id) => id !== todoId)
      : [...checkedIds, todoId];

    upsertTodo(updatedCheckedIds);

    // 주간 리포트 재료: 오늘 목록·체크 기록. 실패해도 할 일 화면에는 영향 없음 (fire-and-forget)
    queueTodoDailyUpsert({
      day: getKoreanDateString({ formatType: 'date' }),
      ...todoDailySnapshot(getTodayTodos(), updatedCheckedIds),
    });
  };

  // 오늘 보이는 할 일 (단식일·단식 다음 날은 단식 시간에 걸린 끼니를 뺀다)
  const getTodayTodos = useCallback(() => {
    let todos = [...baseTodos];
    const currentDay = getKoreanDate().getDay();

    if (fastingStartTime) {
      const index = FASTING_START_TIMES.indexOf(fastingStartTime);
      const startTimeIndex = fastingStartTime === '저녁 식후' ? index + 1 : index; // todo에는 점심과 저녁사이에 오후 간식이 있음

      if (fastingDays.includes(currentDay)) {
        todos = todos.slice(0, startTimeIndex + 1);
      }
      if (fastingNextDays.includes(currentDay)) {
        todos = todos.slice(startTimeIndex);
      }
    }
    return todos;
  }, [baseTodos, fastingStartTime, fastingDays, fastingNextDays]);

  // 주간 리포트 재료: 그날 처음 목록을 불러오면 체크 없이 목록만 남긴다 (이미 있으면 그대로).
  // 체크는 어제 값이 남아 있을 수 있어(초기화 전) 넣지 않는다. 실패해도 화면에는 영향 없음
  useEffect(() => {
    if (!userId || isLoading || isFastingLoading) return;
    const today = getKoreanDateString({ formatType: 'date' });
    const key = `${userId}:${today}`;
    if (snapshotSentKey === key) return;
    const { items } = todoDailySnapshot(getTodayTodos(), []);
    if (items.length === 0) return;
    snapshotSentKey = key;
    void TodoDailyAPI.insertIfAbsent({ day: today, items });
  }, [userId, isLoading, isFastingLoading, getTodayTodos]);

  useEffect(() => {
    const todos = getTodayTodos();

    const checkedTodos = todos.map((todo) =>
      checkedIds.includes(todo.id) ? { ...todo, checked: true } : todo
    );

    const sortedTodos = [...checkedTodos].sort((a, b) => {
      if (a.checked === b.checked) return a.id - b.id;
      return Number(a.checked) - Number(b.checked);
    });
    setTodos(sortedTodos);

    const completedRate = Math.round((checkedIds.length / todos.length) * 100);
    setCompletedRate(completedRate);
  }, [checkedIds, getTodayTodos]);

  return {
    todos,
    completedRate,
    isLoading,
    resetTodos,
    toggleChecked,
  };
};
