import NetInfo from '@react-native-community/netinfo';
import { showErrorToast } from './showToast';

const NETWORK_TOAST_INTERVAL_MS = 3000;
let lastNetworkToastAt = 0;

// 연결 여부를 아직 확인 중(null)이면 온라인으로 보고 요청을 보냄
export const isOnline = async () => {
  const { isConnected, isInternetReachable } = await NetInfo.fetch();
  return isConnected !== false && isInternetReachable !== false;
};

// 오프라인에서 여러 요청이 동시에 실패해도 토스트는 한 번만
export const showNetworkErrorToast = () => {
  const now = Date.now();
  if (now - lastNetworkToastAt < NETWORK_TOAST_INTERVAL_MS) return;

  lastNetworkToastAt = now;
  showErrorToast({ textType: 'NETWORK_ERROR' });
};

// 인터넷이 필요한 기능: 오프라인이면 실행하지 않고 토스트만
export const requireOnline =
  <Args extends unknown[], Result>(action: (...args: Args) => Result) =>
  async (...args: Args): Promise<Awaited<Result> | undefined> => {
    if (!(await isOnline())) {
      showNetworkErrorToast();
      return undefined;
    }
    return await action(...args);
  };
