import * as Sentry from '@sentry/react-native';
import { showErrorToast } from './showToast';

interface OptionsProps<T> {
  errorReturnValue?: T;
}

export default async function sendDBError<T>(
  callback: () => Promise<T>,
  options?: OptionsProps<T>
) {
  try {
    const result = await callback();

    return result;
  } catch (error) {
    if (error instanceof Error) {
      Sentry.captureException(error, { level: 'fatal' });
    } else {
      const templateString = '[Supabase]: ';
      Sentry.captureException(new Error(templateString + JSON.stringify(error)));
    }

    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return options.errorReturnValue;
  }
}
