import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Maybe } from 'types/common';
import { FastingResultDB } from 'types/database';
import { captureError, sendError } from 'utils/sendError';

export type FastingResult = 'success' | 'broken';

// 그 단식(시작일 KST 날짜)의 결과. 응답 전이면 null. 실패 시 throw (React Query가 재시도)
const selectOne = async (day: string): Promise<FastingResult | null> => {
  const uid = useUserStore.getState().id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('fasting_result')
    .select('result')
    .eq('uid', uid)
    .eq('day', day)
    .maybeSingle();

  if (error) {
    captureError({ error, prefix: '[FastingResultAPI.selectOne]: ' });
    throw error;
  }
  return (data?.result as FastingResult | undefined) ?? null;
};

// 단식 결과 저장. 다시 누르면 그날 값을 바꾼다. 실패하면 토스트 후 undefined
const upsert = async ({ day, result }: { day: string; result: FastingResult }) =>
  sendError<Maybe<FastingResultDB>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('fasting_result')
      .upsert({ uid, day, result, updated_at: new Date().toISOString() }, { onConflict: 'uid,day' })
      .select()
      .single();

    if (error) throw error;
    return data;
  });

// fromDay(포함) 이후의 단식 결과. 실패 시 throw
const selectSince = async (fromDay: string): Promise<{ day: string; result: FastingResult }[]> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('fasting_result')
    .select('day, result')
    .eq('uid', uid)
    .gte('day', fromDay);

  if (error) throw error;
  return (data ?? []).map((row) => ({ day: row.day, result: row.result as FastingResult }));
};

export const FastingResultAPI = { selectOne, upsert, selectSince };
