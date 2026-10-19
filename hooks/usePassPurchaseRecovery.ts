import NetInfo from '@react-native-community/netinfo';
import { PassAPI } from 'api/PassAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { recoverPendingPurchases } from 'services/billing';
import { useUserStore } from 'stores/userStore';
import { isOnline } from 'utils/network';
import { createRecoveryRunner } from 'utils/passRecovery';

// 앱 프로세스 전체에서 하나 (스로틀/실행 중 상태 공유)
const triggerRecovery = createRecoveryRunner({
  isOnline,
  now: () => Date.now(),
  run: async () => {
    await recoverPendingPurchases(PassAPI.verify);
    await queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
  },
});

const recover = (uid: string) =>
  triggerRecovery(uid).catch((error) => console.error('[usePassPurchaseRecovery]', error));

// 결제 누락 복구: 서버가 아직 소비하지 않은 패스 구매를 다시 검증 요청한다.
// Play는 3일 안에 소비되지 않은 구매를 환불하고 앱은 며칠씩 살아 있을 수 있으므로,
// 로그인 직후뿐 아니라 포그라운드 복귀와 네트워크 재연결 때도 실행한다 (최대 1분에 한 번, 오프라인이면 건너뜀)
export const usePassPurchaseRecovery = () => {
  const uid = useUserStore((state) => state.id);

  useEffect(() => {
    if (!uid) return;

    recover(uid);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recover(uid);
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) recover(uid);
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeNetInfo();
    };
  }, [uid]);
};
