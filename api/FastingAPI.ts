import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { sendError } from 'utils/sendError';
import { Maybe } from '../types/common';

const selectOne = async () =>
  sendError<Maybe<FastingDB>>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('fasting')
      .select('*')
      .eq('uid', userId)
      .maybeSingle();

    if (error) throw error;

    return data;
  });

const upsert = async (body: Partial<FastingDB>) =>
  sendError<FastingDB>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('fasting')
      .upsert({ ...body, uid: userId }, { onConflict: 'uid' })
      .eq('uid', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  });

export const FastingAPI = {
  selectOne,
  upsert,
};
