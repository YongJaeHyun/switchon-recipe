import * as Sentry from '@sentry/react-native';
import { ErrorToastTextProps } from 'types/toast';
import { showErrorToast } from './showToast';

interface CaptureErrorProps {
  error: unknown;
  prefix: string;
  level?: Sentry.SeverityLevel;
}

interface OptionsProps extends ErrorToastTextProps {
  prefix?: string;
}

const isNetworkError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.includes('Network request failed');
  }
  return false;
};

const isGatewayTimeoutError = (error: any) => {
  if ('code' in error && error.code === '504') {
    return true;
  }
  return false;
};

const captureError = ({ error, prefix, level = 'error' }: CaptureErrorProps) => {
  if (error instanceof Error) {
    Sentry.captureException(error, { level });
  } else {
    Sentry.captureException(new Error(prefix + JSON.stringify(error)));
  }
};

const sendError = async <Response>(callback: () => Promise<Response>, options?: OptionsProps) => {
  try {
    const result = await callback();

    return result;
  } catch (error) {
    if (isNetworkError(error)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
    } else if (isGatewayTimeoutError(error)) {
      showErrorToast({ textType: 'GATEWAY_TIMEOUT_ERROR' });
      captureError({ error, prefix: '[Gateway Timeout 504]: ' });
    } else {
      if (options?.textType === 'CUSTOM') {
        showErrorToast({ textType: 'CUSTOM', title: options?.title, subtitle: options?.subtitle });
      } else {
        showErrorToast({ textType: options?.textType ?? 'DB_REQUEST_ERROR' });
      }

      captureError({ error, prefix: options?.prefix ?? '[Supabase]: ', level: 'fatal' });
    }
  }
};

export { captureError, isNetworkError, sendError };
