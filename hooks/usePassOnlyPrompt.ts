import type { PassOnlyModalView } from 'components/common/PassOnlyModal';
import type { PassFeatureId } from 'const/passFeatures';
import { useState } from 'react';
import { isPassOnSale } from 'utils/passScreen';
import { useBillingAvailable } from './useBillingAvailable';
import { usePass } from './usePass';

// 패스 기능 버튼: 패스가 있으면 바로 실행, 없으면 결제 화면으로 바로 보내지 않고 "패스 기능이에요" 창으로 먼저 묻는다.
// 패스 상태를 아직 모르면(로딩·오프라인) 다시 받고 실행하지 않는다 (서버가 최종 판단)
export const usePassOnlyPrompt = (
  featureId: PassFeatureId,
  feature: string,
  description: string
) => {
  const { status, refetch } = usePass();
  const billingAvailable = useBillingAvailable();
  const [view, setView] = useState<PassOnlyModalView | null>(null);

  const guard =
    <Args extends unknown[]>(action: (...args: Args) => void) =>
    (...args: Args) => {
      if (!status) {
        refetch();
        return;
      }
      if (status.hasAccess) {
        action(...args);
        return;
      }
      setView({
        featureId,
        feature,
        description,
        canBuy: isPassOnSale(status.sales, billingAvailable),
      });
    };

  return {
    guard,
    hasAccess: status?.hasAccess === true,
    // 패스가 없다고 확인됐을 때만 true (로딩 중에는 잠금 표시를 띄우지 않는다)
    locked: status?.hasAccess === false,
    modalProps: { view, onClose: () => setView(null) },
  };
};
