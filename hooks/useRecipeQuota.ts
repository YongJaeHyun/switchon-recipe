import { RecipeQuotaAPI } from 'api/RecipeQuotaAPI';
import { QueryKey } from 'const/queryKey';
import { useUserStore } from 'stores/userStore';
import type { RecipeQuota } from 'types/recipeQuota';
import { useQueryWith402Retry } from './useCustomQuery';

const STALE_TIME = 30 * 1000;

// 오늘 레시피 생성 한도. 표시용이고 서버(consume_recipe_quota)가 최종 판단한다
export const useRecipeQuota = (): {
  quota: RecipeQuota | undefined;
  isLoading: boolean;
  refetch(): Promise<RecipeQuota | undefined>;
} => {
  const uid = useUserStore((state) => state.id);

  const { data, isLoading, refetch } = useQueryWith402Retry<RecipeQuota>({
    // 계정이 바뀌면 다른 캐시를 쓴다. 무효화는 [QueryKey.recipeQuota] 접두어로 한다
    queryKey: [QueryKey.recipeQuota, uid],
    queryFn: RecipeQuotaAPI.get,
    enabled: !!uid,
    staleTime: STALE_TIME,
  });

  return { quota: data, isLoading, refetch: async () => (await refetch()).data };
};
