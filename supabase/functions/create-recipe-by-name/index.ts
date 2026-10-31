/// <reference lib="deno.ns" />

// 먹고 싶은 음식 이름으로 레시피 만들기 (패스 기능, 무료 체험 2번): 실제 의존성을 연결해 handleRecipeByName을 서비스한다.
// 패스 확인·체험·한도 rpc는 유저 헤더가 없는 service role 클라이언트로 하고(유저 JWT를 실으면 authenticated로
// 처리되어 거부됨), 레시피 생성·이미지·저장은 기존 create-recipe-by-gemini와 같은 generateAndSaveRecipe를 쓴다.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { createRecipeClients, generateAndSaveRecipe } from '../_shared/createRecipe.ts';
import { parseTrialConsume } from '../_shared/foodCheckTrial.ts';
import { parsePremiumQuota } from '../_shared/premiumQuota.ts';
import { createProviderAlertFetch } from '../_shared/providerAlert.ts';
import { parseQuotaDecision } from '../_shared/quota.ts';
import { RECIPE_BY_NAME_TRIAL_LIMIT } from '../_shared/recipeNameCheck.ts';
import { handleRecipeByName, type RecipeByNameDeps } from './handler.ts';
import { requestNameCheck } from './nameCheck.ts';

const NAME_CHECK_FEATURE = 'recipe_name_check';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Gemini가 결제·키·장애로 실패하면 운영자 Slack 알림 (_shared/providerAlert.ts). 응답·오류 처리는 그대로다
const providerFetch = createProviderAlertFetch({
  functionName: 'create-recipe-by-name',
  client: supabase,
  webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
});

const depsFor = (req: Request): RecipeByNameDeps => ({
  getUid,
  premiumClient: supabase,
  now: () => new Date(),

  async consumeTrial(uid) {
    const { data, error } = await supabase.rpc('consume_recipe_by_name_trial', {
      p_uid: uid,
      p_limit: RECIPE_BY_NAME_TRIAL_LIMIT,
    });
    if (error) throw new Error(`무료 체험 확인 실패: ${error.message}`);
    return parseTrialConsume(data);
  },

  async releaseTrial(uid) {
    const { error } = await supabase.rpc('release_recipe_by_name_trial', { p_uid: uid });
    if (error) throw new Error(`무료 체험 복구 실패: ${error.message}`);
  },

  async consumeNameCheck(uid) {
    const { data, error } = await supabase.rpc('consume_premium_quota', {
      p_uid: uid,
      p_feature: NAME_CHECK_FEATURE,
    });
    if (error) throw new Error(`이름 확인 한도 확인 실패: ${error.message}`);
    return parsePremiumQuota(data);
  },

  async releaseNameCheck(uid) {
    const { error } = await supabase.rpc('release_premium_quota', {
      p_uid: uid,
      p_feature: NAME_CHECK_FEATURE,
    });
    if (error) throw new Error(`이름 확인 한도 복구 실패: ${error.message}`);
  },

  async consumeQuota(uid) {
    const { data, error } = await supabase.rpc('consume_recipe_quota', { p_uid: uid });
    if (error) throw new Error(`레시피 한도 확인 실패: ${error.message}`);
    return parseQuotaDecision(data);
  },

  async releaseQuota(uid) {
    const { error } = await supabase.rpc('release_recipe_quota', { p_uid: uid });
    if (error) throw new Error(`레시피 한도 복구 실패: ${error.message}`);
  },

  async getStartDate(uid) {
    const { data, error } = await supabase
      .from('user')
      .select('start_date')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.start_date ?? null;
  },

  checkName: (prompt) => requestNameCheck(prompt, requireEnv('GEMINI_API_KEY'), providerFetch),

  // recipe insert는 기존 생성과 같이 유저 JWT를 실은 클라이언트로 한다 (uid 기본값이 요청 유저로 채워짐)
  generate: ({ command, week, isZeroCarb, recipeName, adaptNote }) =>
    generateAndSaveRecipe(createRecipeClients(req), providerFetch, {
      command,
      week,
      is_zero_carb: isZeroCarb,
      recipeName,
      adaptNote,
    }),
});

serve((req: Request) => handleRecipeByName(req, depsFor(req)));
