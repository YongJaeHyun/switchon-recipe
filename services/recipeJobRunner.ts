import { RecipeByNameAPI } from 'api/RecipeByNameAPI';
import { createRecipe } from 'api/gemini';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useRecipeJobStore } from 'stores/recipeJobStore';
import type { RecipeDB } from 'types/database';
import { isQuotaExceeded } from 'types/recipeQuota';
import { type RecipeJobResult, shouldOpenOnDone } from 'utils/recipeJob';
import { showInfoToast } from 'utils/showToast';

export interface RecipeCreationRequest {
  command: string;
  week: number;
  isZeroCarb: boolean;
}

export interface RecipeByNameRequest {
  name: string;
  isZeroCarb: boolean;
  // 보낼 주차 (1~4, 5 = 유지기)
  week: number;
}

export type RecipeJobInput =
  | { kind: 'ingredients'; request: RecipeCreationRequest }
  // weekChoice: 시트에서 고른 주차 칸 (거절되면 같은 칸으로 시트를 다시 연다)
  | { kind: 'byName'; request: RecipeByNameRequest; weekChoice: number };

export interface RecipeJobMeta {
  label: string;
  origin: string;
}

// 띠가 다시 보내거나(광고 보상 뒤) 시트를 다시 여는 데 쓰는, 작업에 붙여 두는 원래 요청
export interface SavedRecipeJob {
  input: RecipeJobInput;
  meta: RecipeJobMeta;
}

export const openRecipeDetail = (recipe: RecipeDB) =>
  router.push(`/recipeDetail?recipe=${JSON.stringify(recipe)}`);

const runIngredients = async (request: RecipeCreationRequest): Promise<RecipeJobResult> => {
  const recipe = await createRecipe(request);
  if (isQuotaExceeded(recipe)) return { type: 'quota', quota: recipe };
  if (!recipe) return { type: 'error' };
  return { type: 'done', recipe };
};

const runByName = async (request: RecipeByNameRequest): Promise<RecipeJobResult> => {
  const outcome = await RecipeByNameAPI.create(request);
  // 네트워크·시간 초과는 API가 토스트로도 알린다. 띠에도 남겨 다른 화면에 있어도 놓치지 않게
  if (!outcome) return { type: 'error' };
  switch (outcome.status) {
    case 'ok':
      return { type: 'done', recipe: outcome.recipe };
    case 'rejected':
    case 'nameCheckLimit':
    case 'invalid':
      return { type: 'rejected', message: outcome.message };
    case 'quotaExceeded':
      return { type: 'quota', quota: outcome.quota };
    case 'locked':
      return { type: 'locked' };
    case 'error':
      return { type: 'error' };
  }
};

// 화면과 상관없이 끝까지 받는다: 띠(components/common/RecipeJobBand)가 진행·결과를 보여 준다.
// 이미 하나가 도는 중이면 false (버튼도 막혀 있다)
export const runRecipeJob = (input: RecipeJobInput, meta: RecipeJobMeta): boolean => {
  const saved: SavedRecipeJob = { input, meta };
  const id = useRecipeJobStore.getState().start({ ...meta, input: saved });
  if (id === null) return false;
  showInfoToast({
    textType: 'CUSTOM',
    title: '만들기 시작했어요',
    subtitle: '다른 화면을 봐도 계속 만들어요',
  });
  void (async () => {
    let result: RecipeJobResult;
    try {
      result =
        input.kind === 'ingredients'
          ? await runIngredients(input.request)
          : await runByName(input.request);
    } catch {
      result = { type: 'error' };
    } finally {
      // 하루 한도·무료 체험 표시를 서버 값으로 다시 받는다
      void queryClient.invalidateQueries({ queryKey: [QueryKey.recipeQuota] });
      if (input.kind === 'byName') {
        void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
      }
    }
    if (result.type === 'done') queryClient.removeQueries({ queryKey: [QueryKey.recentRecipes] });

    const store = useRecipeJobStore.getState();
    store.finish(id, result);
    const after = useRecipeJobStore.getState();
    if (after.job.phase === 'done' && shouldOpenOnDone(after, after.focusedOrigins)) {
      const { recipe } = after.job;
      after.dismiss();
      openRecipeDetail(recipe);
    }
  })();
  return true;
};
