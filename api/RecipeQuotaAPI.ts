import { supabase } from 'lib/supabase';
import type { RecipeQuota } from 'types/recipeQuota';
import { captureError } from 'utils/sendError';

// 오늘 레시피 생성 한도 조회. 실패 시 throw: 호출부(React Query)가 재시도/표시를 정한다
const get = async (): Promise<RecipeQuota> => {
  const { data, error } = await supabase.rpc('get_recipe_quota');

  if (error || !data) {
    captureError({
      error: error ?? new Error('empty response'),
      prefix: '[RecipeQuotaAPI.get]: ',
    });
    throw error ?? new Error('get_recipe_quota: empty response');
  }
  return data as unknown as RecipeQuota;
};

export const RecipeQuotaAPI = { get };
