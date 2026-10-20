import { useQueryClient } from '@tanstack/react-query';
import { RecipeQuotaAPI } from 'api/RecipeQuotaAPI';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAdsAvailable, showRewardedAd } from 'services/ads';
import { useUserStore } from 'stores/userStore';
import type { QuotaExceeded } from 'types/recipeQuota';
import {
  formatRemaining,
  getQuotaModalActions,
  runAdBonusFlow,
  waitForAdBonus,
} from 'utils/recipeQuota';
import { isPassOnSale } from 'utils/passScreen';
import { showInfoToast } from 'utils/showToast';
import { useBillingAvailable } from './useBillingAvailable';
import { usePass } from './usePass';
import { useRecipeQuota } from './useRecipeQuota';

// low/zero 생성 화면이 공유하는 한도 초과 모달 + 광고 보상 흐름 상태
export const useQuotaGate = () => {
  const queryClient = useQueryClient();
  const uid = useUserStore((state) => state.id);
  const { quota } = useRecipeQuota();
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();

  const [exceeded, setExceeded] = useState<QuotaExceeded | null>(null);
  const [adsAvailable, setAdsAvailable] = useState(false);
  const [isWaitingBonus, setIsWaitingBonus] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const remainingText = quota ? formatRemaining(quota) : null;
  const onSale = isPassOnSale(status?.sales, billingAvailable);

  useEffect(() => {
    let cancelled = false;
    isAdsAvailable().then((available) => {
      if (!cancelled) setAdsAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidateQuota = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [QueryKey.recipeQuota] }),
    [queryClient]
  );

  const actions = exceeded
    ? getQuotaModalActions({
        isPass: exceeded.isPass,
        canWatchAd: exceeded.canWatchAd,
        onSale,
        adsAvailable,
      })
    : [];

  const close = () => {
    if (!busy.current) setExceeded(null);
  };

  const goPass = () => {
    setExceeded(null);
    router.push('/pass');
  };

  // retry: 같은 재료/옵션으로 생성을 다시 실행하는 화면의 핸들러
  const watchAd = async (retry: () => Promise<void>) => {
    if (busy.current || !uid) return;
    busy.current = true;
    setExceeded(null);

    try {
      const outcome = await runAdBonusFlow({
        showAd: () => showRewardedAd(uid),
        waitBonus: () => waitForAdBonus(RecipeQuotaAPI.get),
        retry,
        isMounted: () => mounted.current,
        onWaiting: setIsWaitingBonus,
      });
      if (outcome === 'delayed' && mounted.current) {
        showInfoToast({
          textType: 'CUSTOM',
          title: '보상 확인이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
        });
      }
    } catch {
      showInfoToast({
        textType: 'CUSTOM',
        title: '광고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
      });
    } finally {
      if (mounted.current) setIsWaitingBonus(false);
      busy.current = false;
      void invalidateQuota();
    }
  };

  return {
    remainingText,
    exceeded,
    showExceeded: setExceeded,
    actions,
    isWaitingBonus,
    invalidateQuota,
    close,
    goPass,
    watchAd,
  };
};
