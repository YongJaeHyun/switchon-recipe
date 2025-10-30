import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { SearchHistoryDB } from 'types/database';
import { sendError } from 'utils/sendError';

const getRecent = async () =>
  sendError<SearchHistoryDB[]>(async () => {
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('user_search_history')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return data;
  });

const insert = async (keyword: string) =>
  sendError<SearchHistoryDB>(async () => {
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('user_search_history')
      .upsert({ value: keyword, uid: userId, created_at: new Date() }, { onConflict: 'uid,value' })
      .select()
      .single();

    if (error) throw error;

    return data;
  });

const deleteOne = async (id: number) =>
  sendError(async () => {
    const { data, error } = await supabase.from('user_search_history').delete().eq('id', id);

    if (error) throw error;

    return data;
  });

const deleteAll = async () =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase.from('user_search_history').delete().eq('uid', userId);

    if (error) throw error;

    return data;
  });

export const SearchHistoryAPI = {
  getRecent,
  insert,
  deleteOne,
  deleteAll,
};
