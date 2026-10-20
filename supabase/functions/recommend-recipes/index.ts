/// <reference lib="deno.ns" />

// 맞춤 레시피 추천 엣지 함수: 실제 의존성(Supabase)을 연결해 handleRecommend를 서비스한다.
// DB 조회는 모두 유저 헤더가 없는 service role 클라이언트로 한다 (uid는 JWT에서 getUid로 구함).
// recipe_with_is_saved 뷰는 생성 시점에 열 목록이 고정돼 새 태그 열(spicy·cuisine·method)이 없으므로
// recipe 테이블을 직접 조회하고 저장 여부·저장 수는 saved_recipe에서 따로 붙인다.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import {
  handleRecommend,
  type RecipeCandidateRow,
  type RecipeCardRow,
  type RecommendDeps,
} from './handler.ts';

const CANDIDATE_COLUMNS =
  'id, week, is_zero_carb, cooking_time, ingredients, spicy, cuisine, method';
const CARD_COLUMNS =
  'id, recipe_name, image_uri, ingredients, cooking_steps, cooking_time, nutrition, is_zero_carb, week, created_at, uid';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const deps: RecommendDeps = {
  getUid,
  premiumClient: supabase,
  now: () => new Date(),
  random: Math.random,

  async getStartDate(uid) {
    const { data, error } = await supabase
      .from('user')
      .select('start_date')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.start_date ?? null;
  },

  async getExcludedIngredients(uid) {
    const { data, error } = await supabase
      .from('user_recipe_preference')
      .select('excluded_ingredients')
      .eq('uid', uid)
      .maybeSingle();
    if (error) throw error;
    return (data?.excluded_ingredients as string[] | null) ?? [];
  },

  async getRegisteredIngredients() {
    return await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('ingredient')
        .select('name, sub_keywords')
        .eq('is_active', true)
        .order('id')
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as { name: string; sub_keywords: string[] }[];
    });
  },

  // 탐색 탭과 같은 공개 범위: 이미지가 있는 레시피 중 week <= maxWeek
  async fetchCandidates(maxWeek) {
    return await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('recipe')
        .select(CANDIDATE_COLUMNS)
        .not('image_uri', 'is', null)
        .lte('week', maxWeek)
        .order('id')
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as RecipeCandidateRow[];
    });
  },

  async fetchCards(ids) {
    const { data, error } = await supabase.from('recipe').select(CARD_COLUMNS).in('id', ids);
    if (error) throw error;
    return (data ?? []) as RecipeCardRow[];
  },

  async fetchOwnSaves(uid, ids) {
    const { data, error } = await supabase
      .from('saved_recipe')
      .select('recipe_id, created_at')
      .eq('uid', uid)
      .in('recipe_id', ids);
    if (error) throw error;
    return (data ?? []) as { recipe_id: number; created_at: string }[];
  },

  async countOtherSaves(uid, ids) {
    const counts = await Promise.all(
      ids.map(async (id) => {
        const { count, error } = await supabase
          .from('saved_recipe')
          .select('id', { count: 'exact', head: true })
          .eq('recipe_id', id)
          .neq('uid', uid);
        if (error) throw error;
        return [id, count ?? 0] as const;
      })
    );
    return Object.fromEntries(counts);
  },
};

serve((req: Request) => handleRecommend(req, deps));
