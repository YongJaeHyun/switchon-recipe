import { RecipeByNameAPI } from 'api/RecipeByNameAPI';
import { createRecipe } from 'api/gemini';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useRecipeByNameSheetStore } from 'stores/recipeByNameSheetStore';
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

// 요청 시간 제한(120초)보다 조금 길게: 그래도 끝나지 않으면 오류로 끝내 [만들기]가 계속 막히지 않게 한다.
// 그 뒤에 온 결과는 작업 id가 달라 무시된다 (utils/recipeJob finishRecipeJob)
export const RECIPE_JOB_WATCHDOG_MS = 150 * 1000;
let watchdog: ReturnType<typeof setTimeout> | null = null;

const clearWatchdog = () => {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
};

// 로그아웃·계정 바뀜: 띠·다시 보낼 요청·시트 요청을 비운다. 도는 요청의 결과는 무시된다
export const resetRecipeJobs = () => {
  clearWatchdog();
  useRecipeJobStore.getState().reset();
  useRecipeByNameSheetStore.getState().reset();
};

const runIngredients = async (request: RecipeCreationRequest): Promise<RecipeJobResult> => {
  const recipe = await createRecipe({ ...request, quiet: true });
  if (isQuotaExceeded(recipe)) return { type: 'quota', quota: recipe };
  if (!recipe) return { type: 'error' };
  return { type: 'done', recipe };
};

const runByName = async (request: RecipeByNameRequest): Promise<RecipeJobResult> => {
  // 실패 토스트는 끄고 띠로만 알린다 (다른 화면에 있어도 놓치지 않게)
  const outcome = await RecipeByNameAPI.create(request, undefined, true);
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
  clearWatchdog();
  watchdog = setTimeout(() => {
    watchdog = null;
    useRecipeJobStore.getState().finish(id, { type: 'error' });
  }, RECIPE_JOB_WATCHDOG_MS);
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
    // 시간 초과·로그아웃으로 이미 끝난 작업이면 아무것도 하지 않는다
    if (store.job.phase !== 'running' || store.job.id !== id) return;
    clearWatchdog();
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
