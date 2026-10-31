import { SimilarRecipesAPI } from 'api/SimilarRecipesAPI';
import { QueryKey } from 'const/queryKey';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import type { RecipeWithIsSavedDB } from 'types/database';
import { getKoreanDateString } from 'utils/date';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { savedEntriesOf } from 'utils/recommendResponse';
import { similarWeekOf } from 'utils/similarResponse';
import { useQueryWith402Retry } from './useCustomQuery';

const STALE_TIME_MS = 10 * 60 * 1000;

// 레시피 상세의 비슷한 레시피 (최대 6개, 무료). 레시피·주차마다 캐시한다 (서버가 후보를 주차로 자르므로,
// 한 주 더 하기·주차 맞추기로 주차가 바뀌면 새로 받는다).
// 오프라인이면 요청하지 않고 실패시킨다 (화면은 실패·빈 결과면 섹션을 숨긴다)
export const useSimilarRecipes = (recipeId: number | null | undefined) => {
  const uid = useUserStore((state) => state.id);
  const mergeIsSavedMap = useRecipeStore((state) => state.mergeIsSavedMap);
  const startDate = useUserStore((state) => state.start_date);
  const week = similarWeekOf(startDate, getKoreanDateString({ formatType: 'date' }));

  return useQueryWith402Retry<RecipeWithIsSavedDB[]>({
    queryKey: [QueryKey.similarRecipes, uid, recipeId, week],
    queryFn: failFastWhenOffline(async () => {
      const recipes = await SimilarRecipesAPI.getSimilar(recipeId as number);
      // 카드의 별 표시가 서버 저장 여부를 따르도록 저장 여부 맵에 합친다 (새로 받은 응답일 때만)
      mergeIsSavedMap(
        savedEntriesOf(recipes.map((r) => ({ id: r.id as number, is_saved: !!r.is_saved })))
      );
      return recipes;
    }),
    enabled: !!uid && typeof recipeId === 'number',
    staleTime: STALE_TIME_MS,
  });
};
