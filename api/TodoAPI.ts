import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { TodoDB } from 'types/database';
import { sendError } from 'utils/sendError';

const selectOne = async () =>
  sendError<number[]>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase.from('todo').select('*').eq('uid', userId).maybeSingle();

    if (error) throw error;

    return data?.checked_ids ?? [];
  });

const upsert = async (checkedIds: number[]) =>
  sendError<TodoDB>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('todo')
      .upsert({ checked_ids: checkedIds, uid: userId }, { onConflict: 'uid' })
      .eq('uid', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  });

const reset = async () =>
  sendError<TodoDB>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('todo')
      .upsert({ checked_ids: [], uid: userId }, { onConflict: 'uid' })
      .eq('uid', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  });

export const TodoAPI = {
  selectOne,
  upsert,
  reset,
};
