import * as Sentry from '@sentry/react-native';
import { showErrorToast } from './showToast';

interface CaptureErrorProps {
  error: unknown;
  prefix: string;
  level?: Sentry.SeverityLevel;
}

interface OptionsProps<T> {
  errorReturnValue?: T;
}

const captureError = ({ error, prefix, level = 'error' }: CaptureErrorProps) => {
  if (error instanceof Error) {
    Sentry.captureException(error, { level });
  } else {
    Sentry.captureException(new Error(prefix + JSON.stringify(error)));
  }
};

const sendDBError = async <T>(callback: () => Promise<T>, options?: OptionsProps<T>) => {
  try {
    const result = await callback();

    return result;
  } catch (error) {
    captureError({ error, prefix: '[Supabase]: ', level: 'fatal' });

    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return options.errorReturnValue;
  }
};

export { captureError, sendDBError };
