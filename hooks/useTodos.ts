import NetInfo from '@react-native-community/netinfo';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import { StatisticsAPI } from 'api/StatisticsAPI';
import { TodoAPI } from 'api/TodoAPI';
import { TodoDailyAPI } from 'api/TodoDailyAPI';
import { BASE_TODOS } from 'const/baseTodos';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { Todo } from 'types/todo';
import { getKoreanDate, getKoreanDateString, getWeekAndDay } from 'utils/date';
import { fastingDayTodos } from 'utils/fastingTodos';
import { mealEndMinutes, snapLegacySchedule } from 'utils/mealTimes';
import { isBeforeStart } from 'utils/programStart';
import { orEmptyArray } from 'utils/stableDefaults';
import {
  areTodoChecksCurrent,
  createTodoDailySync,
  isTodoListCurrent,
  todoDailySnapshot,
} from 'utils/todoDaily';
import { useQueryWith402Retry } from './useCustomQuery';
import { RESET_FASTING_MUTATION_KEY, useFasting } from './useFasting';
import { useMealAlarmSync } from './useMealAlarmSync';

// 날이 바뀌어 할 일을 초기화하는 중인지 확인용 (todo_daily 다시 보내기)
const RESET_TODOS_MUTATION_KEY = ['resetTodos'];

// todo_daily 보내기 상태 (useTodos는 할 일마다 불리므로 모듈 단위로 하나).
// 빠르게 여러 번 체크하면 요청 도착 순서가 뒤바뀔 수 있어, 마지막 상태만 잠깐 뒤에 보낸다
const todoDaily = createTodoDailySync({
  upsert: TodoDailyAPI.upsert,
  insertIfAbsent: TodoDailyAPI.insertIfAbsent,
  debounceMs: 500,
});

// syncTodoDaily: 앱이 다시 열리거나 네트워크가 돌아오면 못 보낸 todo_daily를 다시 보낸다.
// 리스너가 하나면 되므로 화면에 하나만 있는 곳(TodayChecklist)에서만 켠다. 끼니 알림 맞추기도 여기서 같이 한다
// (오늘 체크가 바뀌면 체크한 끼니 알림을 빼고, 풀면 다시 건다)
export const useTodos = (options?: { syncTodoDaily?: boolean }) => {
  const syncTodoDaily = options?.syncTodoDaily ?? false;
  const userId = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);

  const { week, day } = getWeekAndDay(startDate);
  // 시작 전(시작일이 미래)에는 할 일을 쓰지 않는다: 체크·todo_daily·완료율 기록을 보내지 않는다
  const beforeStart = isBeforeStart(startDate, getKoreanDateString({ formatType: 'date' }));
  const currentStep = week === 1 ? (day <= 3 ? 1 : 2) : week + 1;

  const { schedule: fastingSchedule, isLoading: isFastingLoading } = useFasting();
  // 단식 중 숨기는 끼니는 사용자 끼니 시각의 '식후'로 판정한다
  const mealTimes = useMealAlarmStore((state) => state.times);
  const mealEnds = useMemo(() => mealEndMinutes(mealTimes), [mealTimes]);
  // 옛 식후 라벨 시각(540 등)으로 저장된 단식은 지금 식후 시각으로 읽는다 (다음 날 아침이 숨지 않게)
  const visibleSchedule = useMemo(
    () => snapLegacySchedule(fastingSchedule, mealTimes),
    [fastingSchedule, mealTimes]
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
    mutationKey: RESET_TODOS_MUTATION_KEY,
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

      // 기록 탭 > 리포트(나의 4주 리포트)는 탭이 계속 떠 있어서, 저장 뒤에 다시 받게 한다
      void StatisticsAPI.upsert(completedRate).then(() =>
        queryClient.invalidateQueries({ queryKey: [QueryKey.todoRateStatistics, userId] })
      );
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.todos, userId], context.previousData);
      }
    },
  });

  const toggleChecked = (todoId: number) => {
    if (beforeStart) return;
    const checkedIds = queryClient.getQueryData<number[]>([QueryKey.todos, userId]) || [];

    const isChecked = checkedIds.includes(todoId);

    const updatedCheckedIds = isChecked
      ? checkedIds.filter((id) => id !== todoId)
      : [...checkedIds, todoId];

    upsertTodo(updatedCheckedIds);

    // 주간 리포트 재료: 오늘 목록·체크 기록. 실패해도 할 일 화면에는 영향 없음 (fire-and-forget)
    todoDaily.queueUpsert({
      day: getKoreanDateString({ formatType: 'date' }),
      ...todoDailySnapshot(getTodayTodos(), updatedCheckedIds),
    });
  };

  // 오늘 보이는 할 일 (단식일·단식 다음 날은 단식 시간에 걸린 끼니를 뺀다)
  const getTodayTodos = useCallback(() => {
    return fastingDayTodos([...baseTodos], getKoreanDate().getDay(), visibleSchedule, mealEnds);
  }, [baseTodos, visibleSchedule, mealEnds]);

  // 오늘 목록·체크가 오늘 것인지 (revalidateToday가 주차·일차를 반영하고 초기화가 끝났는지)
  const hydrated = useWeekCompletePopupStore((state) => state.isHydrated);
  const storeWeek = useWeekCompletePopupStore((state) => state.week);
  const storeDay = useWeekCompletePopupStore((state) => state.day);
  const fastingResetting = useIsMutating({ mutationKey: RESET_FASTING_MUTATION_KEY }) > 0;
  const todosResetting = useIsMutating({ mutationKey: RESET_TODOS_MUTATION_KEY }) > 0;
  const todayState = { hydrated, week, storeWeek, fastingResetting };
  const listCurrent = isTodoListCurrent(todayState);
  const checksCurrent = areTodoChecksCurrent({ ...todayState, day, storeDay, todosResetting });

  // 끼니 알림: 오늘 체크가 오늘 것일 때만 (어제 체크로 오늘 알림을 빼지 않게). 시작 전이면 체크 없음
  useMealAlarmSync(
    beforeStart ? [] : !isLoading && checksCurrent ? checkedIds : null,
    syncTodoDaily
  );

  // 앱 복귀·네트워크 재연결 때마다 늘려서 아래 보내기 effect를 다시 돌린다
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (!syncTodoDaily) return;
    const bump = () => setSyncTick((tick) => tick + 1);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') bump();
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) bump();
    });
    return () => {
      appStateSubscription.remove();
      unsubscribeNetInfo();
    };
  }, [syncTodoDaily]);

  // 주간 리포트 재료: 그날 처음 목록을 불러오면 체크 없이 목록만 남긴다 (이미 있으면 그대로).
  // 체크는 어제 값이 남아 있을 수 있어(초기화 전) 넣지 않는다. 새 주 첫날은 단식 초기화가 끝난 뒤에만
  // (지난 주 단식 요일로 자른 목록을 남기지 않게). 실패하면 다음 기회에 다시 보낸다. 화면에는 영향 없음
  useEffect(() => {
    if (!userId || beforeStart || isLoading || isFastingLoading || !listCurrent) return;
    const today = getKoreanDateString({ formatType: 'date' });
    const { items } = todoDailySnapshot(getTodayTodos(), []);
    if (items.length === 0) return;
    todoDaily.sendSnapshot(`${userId}:${today}`, { day: today, items });
  }, [userId, beforeStart, isLoading, isFastingLoading, listCurrent, getTodayTodos, syncTick]);

  // 오프라인에서 체크해 못 보낸 오늘 기록: 체크 상태가 오늘 것일 때 지금 목록·체크 전체를 다시 보낸다
  useEffect(() => {
    if (!userId || beforeStart || isLoading || isFastingLoading || !checksCurrent) return;
    const today = getKoreanDateString({ formatType: 'date' });
    if (!todoDaily.needsResend(today)) return;
    const checked = queryClient.getQueryData<number[]>([QueryKey.todos, userId]) ?? [];
    todoDaily.queueUpsert({ day: today, ...todoDailySnapshot(getTodayTodos(), checked) });
  }, [userId, beforeStart, isLoading, isFastingLoading, checksCurrent, getTodayTodos, syncTick]);

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

  // 오늘 체크가 오늘 것일 때만 지금 완료율 (아니면 null). 위 completedRate(state)는 한 번 늦게 바뀌어
  // 자정 초기화 직후 어제 100%가 잠깐 남을 수 있어, 완주 축하는 이 값을 쓴다
  const currentRate = useMemo(() => {
    if (beforeStart || isLoading || !checksCurrent) return null;
    const count = getTodayTodos().length;
    return count > 0 ? Math.round((checkedIds.length / count) * 100) : null;
  }, [beforeStart, isLoading, checksCurrent, checkedIds, getTodayTodos]);

  return {
    todos,
    completedRate,
    currentRate,
    isLoading,
    resetTodos,
    toggleChecked,
  };
};
