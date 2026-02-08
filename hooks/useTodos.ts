import { useMutation } from '@tanstack/react-query';
import { StatisticsAPI } from 'api/StatisticsAPI';
import { TodoAPI } from 'api/TodoAPI';
import { BASE_TODOS } from 'const/baseTodos';
import { FASTING_DAYS, FASTING_START_TIMES } from 'const/fastingDays';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { Todo } from 'types/todo';
import { getKoreanDate, getWeekAndDay } from 'utils/date';
import { useQueryWith402Retry } from './useCustomQuery';
import { useFasting } from './useFasting';

export const useTodos = () => {
  const userId = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);

  const { week, day } = getWeekAndDay(startDate);
  const currentStep = week === 1 ? (day <= 3 ? 1 : 2) : week + 1;

  const { days: fastingDays, startTime: fastingStartTime } = useFasting();
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

  const { data: checkedIds = [], isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.todos, userId],
    queryFn: TodoAPI.selectOne,
    enabled: !!userId,
  });

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
  };

  useEffect(() => {
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
  }, [checkedIds, baseTodos, fastingStartTime, fastingDays, fastingNextDays]);

  return {
    todos,
    completedRate,
    isLoading,
    resetTodos,
    toggleChecked,
  };
};
