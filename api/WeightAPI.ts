import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Maybe } from 'types/common';
import { WeightLogDB } from 'types/database';
import { captureError, sendError } from 'utils/sendError';

// 내 체중 기록 전체 (날짜순). 실패 시 throw: 호출부(React Query)가 재시도/표시를 정한다
const list = async (): Promise<WeightLogDB[]> => {
  const { data, error } = await supabase
    .from('weight_log')
    .select('*')
    .order('day', { ascending: true });

  if (error || !data) {
    captureError({ error: error ?? new Error('empty response'), prefix: '[WeightAPI.list]: ' });
    throw error ?? new Error('weight_log: empty response');
  }
  return data.map((row) => ({ ...row, weight_kg: Number(row.weight_kg) }));
};

// 그날 체중 저장. 같은 날 다시 저장하면 값을 바꾼다. 실패하면 토스트 후 undefined
const upsert = async ({ day, weight_kg }: { day: string; weight_kg: number }) =>
  sendError<Maybe<WeightLogDB>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('weight_log')
      .upsert(
        { uid, day, weight_kg, updated_at: new Date().toISOString() },
        { onConflict: 'uid,day' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  });

// 그날 기록 삭제. 성공하면 true
const remove = async (day: string) =>
  sendError<boolean>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return false;

    const { error } = await supabase.from('weight_log').delete().eq('uid', uid).eq('day', day);

    if (error) throw error;
    return true;
  });

export const WeightAPI = { list, upsert, remove };
