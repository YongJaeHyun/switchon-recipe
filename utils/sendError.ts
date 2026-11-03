import * as Sentry from '@sentry/react-native';
import { ErrorToastTextProps } from 'types/toast';
import { isTransientServerError } from './emptyErrorResponse';
import { isNetworkError } from './networkError';
import { showNetworkErrorToast } from './network';
import { showErrorToast } from './showToast';

interface CaptureErrorProps {
  error: unknown;
  prefix: string;
  level?: Sentry.SeverityLevel;
}

interface OptionsProps extends ErrorToastTextProps {
  prefix?: string;
}

const isGatewayTimeoutError = (error: any) => {
  if ('code' in error && error.code === '504') {
    return true;
  }
  return false;
};

// 인터넷이 끊긴 오류는 앱 문제가 아니라서 Sentry로 보내지 않는다 (흔적만 남긴다)
const captureError = ({ error, prefix, level = 'error' }: CaptureErrorProps) => {
  if (isNetworkError(error)) {
    Sentry.addBreadcrumb({
      category: 'network',
      level: 'info',
      message: `${prefix}network request failed`,
    });
    return;
  }
  // 서버 앞단의 일시적인 빈 5xx도 앱이 고칠 수 없어 흔적만 남긴다 (오류 코드는 메시지에 남아 있다)
  if (isTransientServerError(error)) {
    Sentry.addBreadcrumb({
      category: 'http',
      level: 'warning',
      message: `${prefix}${(error as { message?: string }).message ?? ''}`,
    });
    return;
  }
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
    console.error(error);

    if (isNetworkError(error)) {
      showNetworkErrorToast();
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
