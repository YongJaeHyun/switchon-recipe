import * as Sentry from '@sentry/react-native';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { InquiryDB } from 'types/database';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

const selectAll = async (): Promise<InquiryDB[]> => {
  const userId = useUserStore.getState().id;

  const { data, error } = await supabase
    .from('inquiry')
    .select('*')
    .eq('uid', userId)
    .order('created_at', { ascending: false });

  if (error) {
    Sentry.captureException(error);
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return [];
  }

  return data;
};

const insertInquiryToDB = async (inquiry: Partial<InquiryDB>) => {
  const { data, error } = await supabase
    .from('inquiry')
    .insert({ ...inquiry })
    .select();

  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    throw error;
  } else {
    showSuccessToast({
      text1: '문의사항이 등록되었습니다.',
      text2: '문의 남겨주셔서 감사합니다 :)',
    });
  }

  return data;
};

export const InquiryAPI = {
  selectAll,
  insertInquiryToDB,
};
