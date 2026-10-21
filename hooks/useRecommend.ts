import { useMutation } from '@tanstack/react-query';
import { RecommendAPI } from 'api/RecommendAPI';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import type { RecipeDB } from 'types/database';
import { type RecommendConditions, SHAKE_MEAL_REASON } from 'types/recommend';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { isPassOnSale } from 'utils/passScreen';
import { savedEntriesOf } from 'utils/recommendResponse';
import { showErrorToast, showInfoToast, showSuccessToast } from 'utils/showToast';
import { useBillingAvailable } from './useBillingAvailable';
import { useQueryWith402Retry } from './useCustomQuery';
import { usePass } from './usePass';

export interface RecommendResult {
  recipes: RecipeDB[];
  totalMatches: number;
}

// 저장된 빼고 싶은 재료 (user_recipe_preference) + [저장]
export const useExcludedIngredients = () => {
  const uid = useUserStore((state) => state.id);
  const queryKey = [QueryKey.recipePreference, uid];

  const query = useQueryWith402Retry<string[]>({
    queryKey,
    queryFn: failFastWhenOffline(RecommendAPI.getExcludedIngredients),
    enabled: !!uid,
    staleTime: Infinity,
  });

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: (ingredients: string[]) => RecommendAPI.saveExcludedIngredients(ingredients),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      showSuccessToast({ textType: 'CUSTOM', title: '빼고 싶은 재료를 저장했어요' });
    },
    onError: () => {
      showErrorToast({
        textType: 'CUSTOM',
        title: '저장 실패',
        subtitle: '잠시 후 다시 시도해 주세요',
      });
    },
  });

  // isLoaded: 저장 목록 조회가 성공했는지 (행이 없어도 [] 로 성공)
  return {
    saved: query.data,
    isLoaded: query.isSuccess,
    isLoading: query.isLoading,
    save,
    isSaving,
  };
};

// 추천 요청 상태. 같은 조건으로 다시 부르면 서버가 다시 섞는다 (결과는 캐시하지 않는다)
export const useRecommend = () => {
  const mergeIsSavedMap = useRecipeStore((state) => state.mergeIsSavedMap);
  const { status: passStatus } = usePass();
  const billingAvailable = useBillingAvailable();

  const [result, setResult] = useState<RecommendResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 상태 반영 전 연타 방지
  const inFlightRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  // 반환값: 쉐이크 끼니라 추천할 수 없었으면 'shake' (화면이 끼니 선택을 비운다)
  const recommend = useCallback(
    async (conditions: RecommendConditions): Promise<'shake' | void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      try {
        const outcome = await RecommendAPI.recommend(conditions, controller.signal);
        if (!outcome || controller.signal.aborted) return;

        switch (outcome.status) {
          case 'ok':
            // 카드의 별 표시가 서버 저장 여부를 따르도록 저장 여부 맵에 합친다
            mergeIsSavedMap(savedEntriesOf(outcome.recipes));
            setResult({ recipes: outcome.recipes, totalMatches: outcome.totalMatches });
            return;
          case 'shake':
            showInfoToast({ textType: 'CUSTOM', title: SHAKE_MEAL_REASON });
            return 'shake';
          case 'locked':
            void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
            if (isPassOnSale(passStatus?.sales, billingAvailable)) {
              router.push('/pass');
            } else {
              showInfoToast({ textType: 'CUSTOM', title: '패스가 필요한 기능이에요' });
            }
            return;
          case 'invalid':
          case 'error':
            showErrorToast({ textType: 'CUSTOM', title: '추천 실패', subtitle: outcome.message });
            return;
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [mergeIsSavedMap, passStatus, billingAvailable]
  );

  return { result, isLoading, recommend };
};
