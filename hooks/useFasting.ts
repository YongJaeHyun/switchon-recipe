import { useMutation } from '@tanstack/react-query';
import { FastingAPI } from 'api/FastingAPI';
import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { FastingTime } from 'const/fastingDays';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useMemo } from 'react';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { getWeekAndDay } from 'utils/date';
import { cancelAllScheduledNotifications, registerWeeklyFastingAlarms } from 'utils/notifications';
import { Maybe } from '../types/common';
import { useQueryWith402Retry } from './useCustomQuery';

// 주차 변경 시 단식 초기화 진행 중인지 확인용 (useFastingPlanBackfill)
export const RESET_FASTING_MUTATION_KEY = ['resetFasting'];

export const useFasting = () => {
  const userId = useUserStore((state) => state.id);

  const { data: fasting, isLoading } = useQueryWith402Retry({
    queryKey: [QueryKey.fasting, userId],
    queryFn: FastingAPI.selectOne,
    enabled: !!userId,
  });

  const { mutate: resetFasting } = useMutation({
    mutationKey: RESET_FASTING_MUTATION_KEY,
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
      // 주차가 바뀌면 fasting이 초기화되므로 이번 주차 계획을 따로 남긴다 (fire-and-forget).
      // 저장이 실패하면 sendError가 undefined를 돌려주므로 계획도 쓰지 않는다
      const startDate = useUserStore.getState().start_date;
      if (data && startDate) {
        void FastingPlanAPI.upsert({
          start_date: startDate.slice(0, 10),
          week_index: getWeekAndDay(startDate).week,
          days: data.days ?? [],
          start_time: data.start_time,
        });
      }
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
