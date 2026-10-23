import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Maybe } from 'types/common';
import { FastingResultDB } from 'types/database';
import { fastingResultRecord as recordOf, fastingResultUpsertRow } from 'utils/fastingResultRecord';
import { captureError, sendError } from 'utils/sendError';

export type FastingResult = 'success' | 'broken';

// 결과와 일찍 끝냈을 때 단식한 시간(분). 성공이거나 옛 앱 기록이면 fastedMinutes = null
export interface FastingResultRecord {
  result: FastingResult;
  fastedMinutes: number | null;
}

// 그 단식(시작일 KST 날짜)의 결과. 응답 전이면 null. 실패 시 throw (React Query가 재시도)
const selectOne = async (day: string): Promise<FastingResultRecord | null> => {
  const uid = useUserStore.getState().id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('fasting_result')
    .select('result, fasted_minutes')
    .eq('uid', uid)
    .eq('day', day)
    .maybeSingle();

  if (error) {
    captureError({ error, prefix: '[FastingResultAPI.selectOne]: ' });
    throw error;
  }
  return data ? recordOf(data) : null;
};

// 단식 결과 저장. 다시 누르면 그날 값을 바꾼다. 성공이면 단식 시간은 지운다. 실패하면 토스트 후 undefined
const upsert = async ({
  day,
  result,
  fastedMinutes,
}: {
  day: string;
  result: FastingResult;
  fastedMinutes?: number | null;
}) =>
  sendError<Maybe<FastingResultDB>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('fasting_result')
      .upsert(fastingResultUpsertRow({ uid, day, result, fastedMinutes, now: new Date() }), {
        onConflict: 'uid,day',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  });

// fromDay(포함) 이후의 단식 결과. 실패 시 throw
const selectSince = async (fromDay: string): Promise<({ day: string } & FastingResultRecord)[]> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('fasting_result')
    .select('day, result, fasted_minutes')
    .eq('uid', uid)
    .gte('day', fromDay);

  if (error) throw error;
  return (data ?? []).map((row) => ({ day: row.day, ...recordOf(row) }));
};

// 그날 결과를 지운다 (진행 중에 일찍 끝냈다가 취소). 실패하면 토스트 후 undefined, 성공하면 true
const remove = async (day: string) =>
  sendError<Maybe<true>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;

    const { error } = await supabase.from('fasting_result').delete().eq('uid', uid).eq('day', day);
    if (error) throw error;
    return true;
  });

export const FastingResultAPI = { selectOne, upsert, selectSince, remove, recordOf };
