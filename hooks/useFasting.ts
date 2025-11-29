import { useMutation, useQuery } from '@tanstack/react-query';
import { FastingAPI } from 'api/FastingAPI';
import { FastingTime } from 'const/fastingDays';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useMemo } from 'react';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { cancelAllScheduledNotifications, registerWeeklyFastingAlarms } from 'utils/notifications';
import { Maybe } from '../types/common';

export const useFasting = () => {
  const userId = useUserStore((state) => state.id);

  const { data: fasting, isLoading } = useQuery({
    queryKey: [QueryKey.fasting, userId],
    queryFn: FastingAPI.selectOne,
    enabled: !!userId,
  });

  const { mutate: resetFasting } = useMutation({
    mutationFn: () =>
      FastingAPI.upsert({ days: [], start_time: null, was_sunday: fasting?.days?.includes(0) }),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: [QueryKey.fasting, userId],
      });

      const previousData = queryClient.getQueryData<FastingDB>([QueryKey.fasting, userId]) || [];

      queryClient.setQueryData([QueryKey.fasting, userId], null);

      return { previousData };
    },
    onSuccess: async () => {
      await cancelAllScheduledNotifications();
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.fasting, userId], context.previousData);
      }
    },
  });

  const { mutate: upsertFasting } = useMutation({
    mutationFn: (body: Partial<FastingDB>) => FastingAPI.upsert(body),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.fasting, userId] });

      const previousData = queryClient.getQueryData<FastingDB>([QueryKey.fasting, userId]) || [];

      queryClient.setQueryData([QueryKey.fasting, userId], newData);

      return { previousData };
    },
    onSuccess: async (data) => {
      await registerWeeklyFastingAlarms(data);
    },
    onError: (err, newData, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.fasting, userId], context.previousData);
      }
    },
  });

  // 월 -> 일로 날짜
  const sortedDays = useMemo(() => {
    if (!fasting?.days) return [];
    return [...fasting.days].sort((a, b) => {
      const aVal = a === 0 ? 7 : a;
      const bVal = b === 0 ? 7 : b;
      return aVal - bVal;
    });
  }, [fasting?.days]);
  return {
    days: sortedDays,
    startTime: fasting?.start_time as Maybe<FastingTime>,
    isLoading,
    resetFasting,
    upsertFasting,
  };
};
