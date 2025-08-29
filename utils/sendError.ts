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

    showErrorToast({ textType: 'DB_REQUEST_ERROR' });
    return options?.errorReturnValue;
  }
};

export { captureError, sendDBError };
