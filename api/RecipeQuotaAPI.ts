import { supabase } from 'lib/supabase';
import type { RecipeQuota, RecipeQuotaSetting } from 'types/recipeQuota';
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

// 하루 한도 설정(무료·패스·광고 보상). 한도 초과 모달의 "패스 하루 N개" 안내에 쓴다
const getSetting = async (): Promise<RecipeQuotaSetting> => {
  const { data, error } = await supabase
    .from('quota_setting')
    .select('free_daily, pass_daily, ad_bonus_daily')
    .eq('id', 1)
    .single();

  if (error || !data) {
    captureError({
      error: error ?? new Error('empty response'),
      prefix: '[RecipeQuotaAPI.getSetting]: ',
    });
    throw error ?? new Error('quota_setting: empty response');
  }
  return {
    freeDaily: data.free_daily,
    passDaily: data.pass_daily,
    adBonusDaily: data.ad_bonus_daily,
  };
};

export const RecipeQuotaAPI = { get, getSetting };
