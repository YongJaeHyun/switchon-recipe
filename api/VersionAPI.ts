import * as Sentry from '@sentry/react-native';
import { supabase } from 'lib/supabase';
import { VersionDB } from 'types/database';
import { showErrorToast } from 'utils/showToast';

const selectLatestVersion = async () => {
  try {
    const { data, error } = await supabase.from('version').select('*').single<VersionDB>();

    if (error) throw new Error(`[Supabase] ${error.message}`);

    return data.latest_version;
  } catch (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureException(new Error(JSON.stringify(error)));
    }

    return '1.0.0';
  }
};

export const VersionAPI = {
  selectLatestVersion,
};
