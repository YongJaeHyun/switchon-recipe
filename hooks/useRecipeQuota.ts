import { useQuery } from '@tanstack/react-query';
import { RecipeQuotaAPI } from 'api/RecipeQuotaAPI';
import { QueryKey } from 'const/queryKey';
import { useUserStore } from 'stores/userStore';
import type { RecipeQuota, RecipeQuotaSetting } from 'types/recipeQuota';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

const STALE_TIME = 30 * 1000;
// 설정은 출시 때나 바뀌므로 길게 캐시한다
const SETTING_STALE_TIME = 60 * 60 * 1000;

// 오늘 레시피 생성 한도. 표시용이고 서버(consume_recipe_quota)가 최종 판단한다
export const useRecipeQuota = (): {
  quota: RecipeQuota | undefined;
  // 하루 한도 설정(무료·패스·광고 보상). 계정과 무관하고, 못 불러오면 undefined
  setting: RecipeQuotaSetting | undefined;
  isLoading: boolean;
  refetch(): Promise<RecipeQuota | undefined>;
} => {
  const uid = useUserStore((state) => state.id);

  const { data, isLoading, refetch } = useQueryWith402Retry<RecipeQuota>({
    // 계정이 바뀌면 다른 캐시를 쓴다. 무효화는 [QueryKey.recipeQuota] 접두어로 한다
    queryKey: [QueryKey.recipeQuota, uid],
    queryFn: failFastWhenOffline(RecipeQuotaAPI.get),
    enabled: !!uid,
    staleTime: STALE_TIME,
  });

  const { data: setting } = useQuery({
    queryKey: [QueryKey.recipeQuotaSetting],
    queryFn: failFastWhenOffline(RecipeQuotaAPI.getSetting),
    staleTime: SETTING_STALE_TIME,
  });

  return { quota: data, setting, isLoading, refetch: async () => (await refetch()).data };
};
