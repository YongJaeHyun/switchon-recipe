import { useMutation, useQuery } from '@tanstack/react-query';
import { StatisticsAPI } from 'api/StatisticsAPI';
import { TodoAPI } from 'api/TodoAPI';
import { BASE_TODOS } from 'const/baseTodos';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { Todo } from 'types/todo';

export const useTodos = () => {
  const userId = useUserStore((state) => state.id);
  const week = useWeekCompletePopupStore((state) => state.week);
  const baseTodos = useMemo(
    () =>
      BASE_TODOS[week]?.map((todo, idx) => ({
        id: idx,
        value: todo,
        checked: false,
      })) ?? [],
    [week]
  );

  const [todos, setTodos] = useState<Todo[]>([]);
  const [completedRate, setCompletedRate] = useState(0);

  const { data: checkedIds = [], isLoading } = useQuery({
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

    const completedRate = Math.round((updatedCheckedIds.length / baseTodos.length) * 100);
    StatisticsAPI.upsert(completedRate);
  };

  useEffect(() => {
    const checkedTodos = baseTodos.map((todo) =>
      checkedIds.includes(todo.id) ? { ...todo, checked: true } : todo
    );

    const sortedTodos = [...checkedTodos].sort((a, b) => {
      if (a.checked === b.checked) return a.id - b.id;
      return Number(a.checked) - Number(b.checked);
    });
    setTodos(sortedTodos);

    const completedRate = Math.round((checkedIds.length / baseTodos.length) * 100);
    setCompletedRate(completedRate);
  }, [checkedIds, baseTodos]);

  return {
    todos,
    completedRate,
    isLoading,
    resetTodos,
    toggleChecked,
  };
};
