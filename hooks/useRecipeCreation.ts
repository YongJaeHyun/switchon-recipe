import { createRecipe } from 'api/gemini';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef, useState } from 'react';
import { isQuotaExceeded } from 'types/recipeQuota';
import { requireOnline } from 'utils/network';
import { useQuotaGate } from './useQuotaGate';

export interface RecipeCreationRequest {
  command: string;
  week: number;
  isZeroCarb: boolean;
}

// 레시피 제작(low/zero 화면, 맞춤 추천의 [이 조건으로 새로 만들기])이 공유하는 생성 흐름:
// createRecipe 호출 -> 한도 확인(초과 시 모달) -> 최근 레시피 무효화 -> 상세 화면으로 이동.
// buildRequest는 누를 때의 화면 상태로 명령문을 만든다 (광고 보상 후 재시도도 같은 핸들러를 쓴다)
export const useRecipeCreation = (buildRequest: () => RecipeCreationRequest) => {
  const quotaGate = useQuotaGate();
  const [isRecipeLoading, setIsRecipeLoading] = useState(false);
  const controller = useRef<AbortController>(null);

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  const createRecipeWithAI = async () => {
    controller.current = new AbortController();
    const { command, week, isZeroCarb } = buildRequest();

    let recipe;
    try {
      recipe = await createRecipe({
        command,
        week,
        isZeroCarb,
        signal: controller.current.signal,
      });
    } finally {
      void quotaGate.invalidateQuota();
    }
    if (!recipe) return null;
    if (isQuotaExceeded(recipe)) {
      quotaGate.showExceeded(recipe);
      return null;
    }

    queryClient.removeQueries({ queryKey: [QueryKey.recentRecipes] });
    return recipe;
  };

  const handleCreateRecipe = async () => {
    setIsRecipeLoading(true);

    try {
      const recipe = await createRecipeWithAI();
      if (recipe) {
        router.push(`/recipeDetail?recipe=${JSON.stringify(recipe)}`);
      }
    } finally {
      setIsRecipeLoading(false);
    }
  };

  return {
    quotaGate,
    isRecipeLoading,
    // 생성 중이거나 광고 보상을 기다리는 중
    isCreating: isRecipeLoading || quotaGate.isWaitingBonus,
    // 버튼 onPress에 바로 쓴다 (오프라인이면 토스트만)
    create: requireOnline(handleCreateRecipe),
    // QuotaExceededModal에 펼쳐 넘긴다
    quotaModalProps: {
      visible: !!quotaGate.exceeded,
      actions: quotaGate.actions,
      adBonusText: quotaGate.adBonusText,
      onWatchAd: requireOnline(() => void quotaGate.watchAd(handleCreateRecipe)),
      onPass: quotaGate.goPass,
      onClose: quotaGate.close,
    },
  };
};
