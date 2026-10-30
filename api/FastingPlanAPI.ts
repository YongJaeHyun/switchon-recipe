import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { FastingPlanDB } from 'types/database';
import { Json } from 'types/database.types';
import { FastingSchedule, scheduleColumns } from 'utils/fastingSchedule';
import { isNetworkError } from 'utils/networkError';
import { captureError } from 'utils/sendError';

// 주차별 단식 계획 (start_date, week_index 기준). 단식 요일 저장 흐름을 막지 않도록
// 실패해도 토스트 없이 넘어간다 (네트워크 오류는 Sentry에도 보내지 않음)
interface PlanBody {
  start_date: string;
  week_index: number;
  days: number[];
  schedule: FastingSchedule;
}

// ignoreDuplicates = true면 이미 있는 계획은 그대로 둔다 (insert-if-absent).
// 요일별 시각(start_minutes)과 옛 라벨(start_time)을 함께 쓴다
const write = async (
  { start_date, week_index, days, schedule }: PlanBody,
  ignoreDuplicates: boolean
): Promise<void> => {
  try {
    const uid = useUserStore.getState().id;
    if (!uid || !start_date) return;

    const { error } = await supabase.from('fasting_plan').upsert(
      {
        uid,
        start_date,
        week_index,
        ...scheduleColumns(days, schedule),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'uid,start_date,week_index', ignoreDuplicates }
    );

    if (error) throw error;
  } catch (error) {
    if (!isNetworkError(error)) captureError({ error, prefix: '[FastingPlanAPI.write]: ' });
  }
};

const upsert = (body: PlanBody) => write(body, false);
const insertIfAbsent = (body: PlanBody) => write(body, true);

// 그 주차의 단식 계획. 없으면 null. 실패 시 throw (React Query가 재시도/무시)
const selectOne = async ({
  start_date,
  week_index,
}: {
  start_date: string;
  week_index: number;
}): Promise<FastingPlanDB | null> => {
  const uid = useUserStore.getState().id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('fasting_plan')
    .select('*')
    .eq('uid', uid)
    .eq('start_date', start_date)
    .eq('week_index', week_index)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// 그 시작일의 모든 주차 계획. 실패 시 throw
const selectAll = async (
  startDate: string
): Promise<
  { week_index: number; days: number[]; start_time: string | null; start_minutes: Json | null }[]
> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('fasting_plan')
    .select('week_index, days, start_time, start_minutes')
    .eq('uid', uid)
    .eq('start_date', startDate);

  if (error) throw error;
  return data ?? [];
};

// 모든 시작일의 계획 (기록 탭 > 단식: 지금 회차와 지난 회차). 실패 시 throw
const selectEvery = async (): Promise<
  {
    start_date: string;
    week_index: number;
    days: number[];
    start_time: string | null;
    start_minutes: Json | null;
    updated_at: string;
  }[]
> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('fasting_plan')
    .select('start_date, week_index, days, start_time, start_minutes, updated_at')
    .eq('uid', uid);

  if (error) throw error;
  return data ?? [];
};

export const FastingPlanAPI = { upsert, insertIfAbsent, selectOne, selectAll, selectEvery };
