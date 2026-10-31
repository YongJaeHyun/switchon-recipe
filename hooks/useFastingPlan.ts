import { useIsMutating } from '@tanstack/react-query';
import { FastingPlanAPI } from 'api/FastingPlanAPI';
import { QueryKey } from 'const/queryKey';
import { useEffect } from 'react';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import type { FastingPlanDB } from 'types/database';
import { getWeekAndDay } from 'utils/date';
import { fastingWeekBoundary, previousWeekPlanOf, type FastingWeekContext } from 'utils/dietGuide';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { scheduleFrom } from 'utils/fastingSchedule';
import { programStartOf } from 'utils/programStart';
import { useQueryWith402Retry } from './useCustomQuery';
import { RESET_FASTING_MUTATION_KEY, useFasting } from './useFasting';

// 단식 결과 응답 창의 주차 경계: 이번 주차 첫날 + 지난 주차 단식 계획.
// 주차가 바뀌어 단식 설정이 초기화돼도 지난 주 마지막 날 단식에 응답할 수 있게 한다.
// 지난 계획은 (시작일, 주차−1). 없으면(한 주 더 하기·주차 맞추기로 시작일이 바뀐 직후, 새 시작일의 2주차) 이번 주차 첫날
// 바로 전날을 덮는 지금 회차 계획 중 가장 최근 것 (previousWeekPlanOf). 그것도 없거나 불러오는 중이면 previous = null (지난 주 날짜는 묻지 않음)
export const useFastingWeekContext = (): FastingWeekContext | undefined => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const programStart = useUserStore((state) => state.program_start);
  const program = programStartOf(programStart, startDate);
  const { week } = getWeekAndDay(startDate);
  const boundary = fastingWeekBoundary(startDate, week);
  const start = startDate ? startDate.slice(0, 10) : '';
  const previousWeekIndex = boundary?.previousWeekIndex ?? null;
  const from = boundary?.from ?? null;

  const { data } = useQueryWith402Retry<FastingPlanDB | null>({
    queryKey: [QueryKey.fastingPlan, uid, start, previousWeekIndex, from, program],
    queryFn: failFastWhenOffline(async () => {
      const direct =
        previousWeekIndex === null
          ? null
          : await FastingPlanAPI.selectOne({ start_date: start, week_index: previousWeekIndex });
      if (direct || from === null) return direct;
      return (previousWeekPlanOf(await FastingPlanAPI.selectEvery(), from, program) ??
        null) as FastingPlanDB | null;
    }),
    // 단식은 2주차부터 (1주차 전날 단식은 오늘 탭에서 묻지 않는다)
    enabled: !!uid && !!boundary && week >= 2,
  });

  if (!boundary) return undefined;
  return {
    from: boundary.from,
    previous: data ? scheduleFrom(data) : null,
  };
};

// 이 기능 이전에 단식 요일을 고른 유저, 주차가 그대로인 시작일 변경: 이번 주차 계획이 없으면 채운다.
// revalidateToday가 이번 주차를 반영하고(팝업 store week = 계산한 주차) 단식 초기화가 끝난 뒤에만,
// 이미 있는 계획은 건드리지 않게(insert-if-absent) uid+start_date+주차당 한 번
let backfilledKey: string | null = null;

export const useFastingPlanBackfill = () => {
  const uid = useUserStore((state) => state.id);
  const startDate = useUserStore((state) => state.start_date);
  const storeWeek = useWeekCompletePopupStore((state) => state.week);
  const { days, schedule, isLoading } = useFasting();
  const resetting = useIsMutating({ mutationKey: RESET_FASTING_MUTATION_KEY }) > 0;

  useEffect(() => {
    if (!uid || !startDate || isLoading || resetting) return;
    if (days.length === 0 || Object.keys(schedule).length === 0) return;
    const { week } = getWeekAndDay(startDate);
    if (week < 2 || storeWeek !== week) return;

    const start = startDate.slice(0, 10);
    const key = `${uid}:${start}:${week}`;
    if (backfilledKey === key) return;
    backfilledKey = key;
    void FastingPlanAPI.insertIfAbsent({
      start_date: start,
      week_index: week,
      days,
      schedule,
    });
  }, [uid, startDate, storeWeek, days, schedule, isLoading, resetting]);
};
