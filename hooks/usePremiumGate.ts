import { router } from 'expo-router';
import { useCallback } from 'react';
import { usePass } from './usePass';

// 구독 전용 기능 진입 가드 (표시용, 서버가 최종 판단).
// 권한 있으면 action 실행, 없으면 결제 화면으로, 판매 중이 아니면 아무 것도 하지 않는다.
// 상태를 아직 모르면(로딩/오프라인) 실행하지 않고 다시 조회만 한다
export const usePremiumGate = (): ((action: () => void) => () => void) => {
  const { status, refetch } = usePass();

  return useCallback(
    (action: () => void) => () => {
      if (!status) {
        refetch();
        return;
      }
      if (status.hasAccess) {
        action();
        return;
      }
      if (status.sales.onSale) router.push('/pass');
    },
    [status, refetch]
  );
};
