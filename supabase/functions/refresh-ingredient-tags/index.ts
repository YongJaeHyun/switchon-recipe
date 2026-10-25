/// <reference lib="deno.ns" />

// 레시피 검색용 재료 태그 갱신 엣지 함수: service role 호출로만 실행한다 (확인은 handler).
// 호출하는 곳: ingredient 변경 트리거(문장마다 1회)·매일 04:50 KST cron
// (마이그레이션 20261026010000_refresh_tags_on_ingredient_change.sql), 배포 직후 첫 전체 채우기(수동).
// 본문: 없음/{} → 전체, { recipeIds: [..] } → 그 레시피만, { dryRun: true } → 바꾸지 않고 수와 예시만.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import type { RegisteredIngredient } from '../_shared/ingredientNormalize.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import type { TagBackfillRow } from '../_shared/recipeIngredientTags.ts';
import { handleRefreshIngredientTags, type RefreshTagsDeps } from './handler.ts';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const deps: RefreshTagsDeps = {
  fetchRegistered() {
    return fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('ingredient')
        .select('name, sub_keywords')
        .eq('is_active', true)
        .order('id')
        .range(from, to);
      if (error) throw new Error(`등록 재료 조회 실패: ${error.message}`);
      return (data ?? []) as RegisteredIngredient[];
    });
  },

  async fetchRecipes(afterId, limit, ids) {
    let query = supabase.from('recipe').select('id, ingredients, ingredient_tags');
    if (afterId !== null) query = query.gt('id', afterId);
    if (ids) query = query.in('id', ids);
    const { data, error } = await query.order('id', { ascending: true }).limit(limit);
    if (error) throw new Error(`레시피 조회 실패: ${error.message}`);
    return (data ?? []) as TagBackfillRow[];
  },

  async updateTags(id, tags) {
    const { error } = await supabase.from('recipe').update({ ingredient_tags: tags }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};

serve((req: Request) => handleRefreshIngredientTags(req, deps));
