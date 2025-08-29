import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { InquiryDB } from 'types/database';
import { sendDBError } from 'utils/sendError';
import { showSuccessToast } from 'utils/showToast';

const selectAll = async (): Promise<InquiryDB[]> =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('inquiry')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data;
  });

const insert = async (inquiry: Partial<InquiryDB>) =>
  sendDBError(async () => {
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
  insert,
};
