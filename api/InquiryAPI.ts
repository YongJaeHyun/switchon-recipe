import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { InquiryDB } from 'types/database';
import { sendError } from 'utils/sendError';
import { showSuccessToast } from 'utils/showToast';
import { Maybe } from '../types/common';

const selectAll = async () =>
  sendError<InquiryDB[]>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('inquiry')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data;
  });

const selectOneById = async (id: number) =>
  sendError<Maybe<InquiryDB>>(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('inquiry')
      .select('*')
      .eq('id', id)
      .eq('uid', userId)
      .maybeSingle();

    if (error) throw error;

    return data;
  });

const insert = async (inquiry: Partial<InquiryDB>) =>
  sendError<InquiryDB>(async () => {
    const { data, error } = await supabase
      .from('inquiry')
      .insert({ ...inquiry })
      .select()
      .single();

    if (error) throw error;

    showSuccessToast({ textType: 'MAKE_INQUIRY_SUCCESS' });

    return data;
  });

export const InquiryAPI = {
  selectAll,
  selectOneById,
  insert,
};
