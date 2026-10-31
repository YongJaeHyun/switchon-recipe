import { type RecipeCreationRequest, runRecipeJob } from 'services/recipeJobRunner';
import { useRecipeJobBusy } from 'stores/recipeJobStore';
import { requireOnline } from 'utils/network';
import { type RecipeJobLabelInput, recipeJobLabel } from 'utils/recipeJob';
import { useQuotaGate } from './useQuotaGate';
import { useRecipeJobOrigin } from './useRecipeJobOrigin';

export type { RecipeCreationRequest } from 'services/recipeJobRunner';

export interface RecipeCreationJob {
  request: RecipeCreationRequest;
  // 만드는 중 띠 문구 (고른 재료 이름 등)
  label: Exclude<RecipeJobLabelInput, { kind: 'byName' }>;
}

// 레시피 제작(low/zero 화면, 맞춤 추천의 [이 조건으로 새로 만들기])이 공유하는 생성 흐름.
// 누르면 뒤에서 만들고(services/recipeJobRunner) 화면은 그대로 쓴다. 진행·완성·한도 초과는 하단 띠가 알린다.
// buildJob은 누를 때의 화면 상태로 명령문을 만든다
export const useRecipeCreation = (buildJob: () => RecipeCreationJob) => {
  // 남은 개수 표시용 (한도 초과 창은 띠가 연다)
  const quotaGate = useQuotaGate();
  const origin = useRecipeJobOrigin();
  const isCreating = useRecipeJobBusy();

  const handleCreateRecipe = () => {
    const { request, label } = buildJob();
    runRecipeJob({ kind: 'ingredients', request }, { label: recipeJobLabel(label), origin });
  };

  return {
    quotaGate,
    // 어느 화면에서든 레시피를 만드는 중이거나 광고 보상을 기다리는 중
    isCreating,
    // 버튼 onPress에 바로 쓴다 (오프라인이면 토스트만)
    create: requireOnline(handleCreateRecipe),
  };
};
