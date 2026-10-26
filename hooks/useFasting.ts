import { useIsMutating, useMutation } from '@tanstack/react-query';
import { FastingAPI } from 'api/FastingAPI';
import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { getWeekAndDay } from 'utils/date';
import { fastingWeekBoundary } from 'utils/dietGuide';
import { FastingSchedule, scheduleColumns, scheduleFrom } from 'utils/fastingSchedule';
import {
  cancelFastingAlarms,
  registerWeeklyFastingAlarms,
  syncFastingAlarms,
} from 'utils/notifications';
import { useQueryWith402Retry } from './useCustomQuery';

// 주차 변경 시 단식 초기화 진행 중인지 확인용 (useFastingPlanBackfill)
export const RESET_FASTING_MUTATION_KEY = ['resetFasting'];

export const useFasting = () => {
  const userId = useUserStore((state) => state.id);

  const {
    data: fasting,
    isLoading,
    dataUpdatedAt,
  } = useQueryWith402Retry({
    queryKey: [QueryKey.fasting, userId],
    queryFn: FastingAPI.selectOne,
    enabled: !!userId,
  });

  const { mutate: resetFasting } = useMutation({
    mutationKey: RESET_FASTING_MUTATION_KEY,
    mutationFn: () =>
      FastingAPI.upsert({
        days: [],
        start_time: null,
        start_minutes: null,
        was_sunday: fasting?.days?.includes(0),
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: [QueryKey.fasting, userId],
      });

      const previousData = queryClient.getQueryData<FastingDB>([QueryKey.fasting, userId]) || [];

      queryClient.setQueryData([QueryKey.fasting, userId], null);

      return { previousData };
    },
    onSuccess: async () => {
      await cancelFastingAlarms();
    },
    onError: (err, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([QueryKey.fasting, userId], context.previousData);
      }
    },
  });

  // 요일별 시각(start_minutes)과 옛 앱·서버용 라벨(start_time)을 함께 저장한다
  const { mutate: upsertFasting } = useMutation({
    mutationFn: ({ days, schedule }: { days: number[]; schedule: FastingSchedule }) =>
      FastingAPI.upsert(scheduleColumns(days, schedule)),
    onMutate: async ({ days, schedule }) => {
      await queryClient.cancelQueries({ queryKey: [QueryKey.fasting, userId] });

      const previousData = queryClient.getQueryData<FastingDB>([QueryKey.fasting, userId]) || [];

      queryClient.setQueryData<Partial<FastingDB>>([QueryKey.fasting, userId], (old) => ({
        ...old,
        ...scheduleColumns(days, schedule),
      }));

      return { previousData };
    },
    onSuccess: async (data) => {
      // 주차가 바뀌면 fasting이 초기화되므로 이번 주차 계획을 따로 남긴다 (fire-and-forget).
      // 저장이 실패하면 sendError가 undefined를 돌려주므로 계획도 쓰지 않는다
      const startDate = useUserStore.getState().start_date;
      const week = getWeekAndDay(startDate).week;
      if (data && startDate) {
        void FastingPlanAPI.upsert({
          start_date: startDate.slice(0, 10),
          week_index: week,
          days: data.days ?? [],
          schedule: scheduleFrom(data),
        });
      }
      // 알림은 이번 주차 날짜에만 (주차가 바뀌면 설정이 초기화된다)
      const boundary = fastingWeekBoundary(startDate, week);
      if (boundary) await registerWeeklyFastingAlarms(data, boundary.from);
      else await cancelFastingAlarms();
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

  // 요일 → 시작 시각(분). start_minutes 우선, 없으면 옛 라벨
  const schedule = useMemo<FastingSchedule>(
    () => (fasting ? scheduleFrom(fasting) : {}),
    [fasting]
  );

  return {
    days: sortedDays,
    schedule,
    fasting, // 원래 행 (알림 다시 걸기용)
    dataUpdatedAt,
    isLoading,
    resetFasting,
    upsertFasting,
  };
};

// 앱을 열 때(단식 행을 불러올 때마다)와 앱으로 돌아올 때 이번 주차 단식 알림을 다시 건다.
// 알림 권한이 없으면 건너뛴다. 화면에 하나뿐인 곳(TodayChecklist)에서만 쓴다
export const useFastingAlarmSync = () => {
  const startDate = useUserStore((state) => state.start_date);
  const { fasting, dataUpdatedAt, isLoading } = useFasting();
  const resetting = useIsMutating({ mutationKey: RESET_FASTING_MUTATION_KEY }) > 0;
  const [foregroundAt, setForegroundAt] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // dataUpdatedAt 0 = 아직 한 번도 불러오지 못함
    if (isLoading || resetting || dataUpdatedAt === 0 || fasting === undefined) return;
    const boundary = fastingWeekBoundary(startDate, getWeekAndDay(startDate).week);
    if (!boundary) return;
    void syncFastingAlarms(fasting, boundary.from);
    // 불러온 행이 바뀌거나(dataUpdatedAt) 앱으로 돌아올 때(foregroundAt)만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt, foregroundAt, startDate, isLoading, resetting]);
};
