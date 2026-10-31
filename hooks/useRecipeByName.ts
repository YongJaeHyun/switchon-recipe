import { RecipeByNameAPI } from 'api/RecipeByNameAPI';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requireOnline } from 'utils/network';
import { isPassOnSale } from 'utils/passScreen';
import { showInfoToast } from 'utils/showToast';
import { useBillingAvailable } from './useBillingAvailable';
import { usePass } from './usePass';
import { useQuotaGate } from './useQuotaGate';

export interface RecipeByNameRequest {
  name: string;
  isZeroCarb: boolean;
}

// 먹고 싶은 음식으로 만들기 시트의 생성 흐름: 호출 → 결과별 안내 → 성공이면 상세로.
// 거절·하루 확인 한도·입력 오류는 시트 안 문구(message)로, 레시피 하루 한도는 기존 한도 모달(광고·패스)로,
// 무료 체험을 다 썼으면(402) 결제 화면으로 보낸다. onSuccess는 시트를 닫는 데 쓴다
export const useRecipeByName = ({ onSuccess }: { onSuccess(): void }) => {
  const quotaGate = useQuotaGate();
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController>(null);
  const lastRequest = useRef<RecipeByNameRequest | null>(null);

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  const run = async () => {
    const request = lastRequest.current;
    if (!request) return;
    setIsLoading(true);
    setMessage(null);
    controller.current = new AbortController();

    try {
      const outcome = await RecipeByNameAPI.create(request, controller.current.signal);
      if (!outcome) return;

      switch (outcome.status) {
        case 'ok':
          queryClient.removeQueries({ queryKey: [QueryKey.recentRecipes] });
          onSuccess();
          router.push(`/recipeDetail?recipe=${JSON.stringify(outcome.recipe)}`);
          return;
        case 'rejected':
        case 'nameCheckLimit':
        case 'invalid':
          setMessage(outcome.message);
          return;
        case 'quotaExceeded':
          quotaGate.showExceeded(outcome.quota);
          return;
        case 'locked':
          onSuccess();
          if (isPassOnSale(status?.sales, billingAvailable)) {
            router.push('/pass');
          } else {
            showInfoToast({ textType: 'CUSTOM', title: '무료 체험을 모두 썼어요' });
          }
          return;
        case 'error':
          setMessage(outcome.message);
          return;
      }
    } finally {
      setIsLoading(false);
      // 무료 횟수·하루 한도 표시를 서버 값으로 다시 받는다
      void quotaGate.invalidateQuota();
      void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
    }
  };

  const create = (request: RecipeByNameRequest) => {
    lastRequest.current = request;
    return requireOnline(run)();
  };

  // 시트가 이 함수를 여는 effect의 의존성으로 쓴다. 렌더마다 새로 만들면 effect가 매번 다시 돌아
  // 입력한 이름이 처음 값으로 되돌아간다 (입력이 안 되는 것처럼 보임)
  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    isLoading,
    // 생성 중이거나 광고 보상을 기다리는 중
    isCreating: isLoading || quotaGate.isWaitingBonus,
    message,
    clearMessage,
    create,
    remainingText: quotaGate.remainingText,
    // QuotaExceededModal에 펼쳐 넘긴다 (광고 보상 뒤 같은 이름으로 다시 만든다)
    quotaModalProps: {
      view: quotaGate.view,
      onWatchAd: requireOnline(() => void quotaGate.watchAd(run)),
      onPass: quotaGate.goPass,
      onClose: quotaGate.close,
    },
  };
};
