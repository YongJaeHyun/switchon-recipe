import { PassAPI } from 'api/PassAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef } from 'react';
import { recoverPendingPurchases } from 'services/billing';
import { useUserStore } from 'stores/userStore';
import { isOnline } from 'utils/network';

// 결제 누락 복구: 로그인한 유저마다 한 번, 서버가 아직 소비하지 않은 패스 구매를 다시 검증 요청한다.
// Play는 3일 안에 소비되지 않은 구매를 환불하므로 앱을 열 때마다 확인한다. 오프라인이면 건너뛴다
export const usePassPurchaseRecovery = () => {
  const uid = useUserStore((state) => state.id);
  const recoveredUid = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || recoveredUid.current === uid) return;
    recoveredUid.current = uid;

    const recover = async () => {
      if (!(await isOnline())) return;
      await recoverPendingPurchases(PassAPI.verify);
      await queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
    };

    recover().catch((error) => console.error('[usePassPurchaseRecovery]', error));
  }, [uid]);
};
