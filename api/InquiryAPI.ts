import * as Sentry from '@sentry/react-native';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { InquiryDB } from 'types/database';

const selectAll = async (): Promise<InquiryDB[]> => {
  const userId = useUserStore.getState().id;

  const { data, error } = await supabase
    .from('inquiry')
    .select('*')
    .eq('uid', userId)
    .order('created_at', { ascending: false });

  if (error) {
    Sentry.captureException(error);
    return [];
  }

  return data;
};

export const InquiryAPI = {
  selectAll,
};
