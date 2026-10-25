/// <reference lib="deno.ns" />

// 비슷한 레시피 엣지 함수: 실제 의존성(Supabase)을 연결해 handleSimilar를 서비스한다.
// DB 조회는 모두 유저 헤더가 없는 service role 클라이언트로 한다 (uid는 JWT에서 getUid로 구함).
// recipe_with_is_saved 뷰에는 태그 열이 없으므로 recipe 테이블을 직접 조회하고
// 저장 여부·저장 수는 saved_recipe에서 따로 붙인다 (recommend-recipes와 같은 방식).
// 무료 기능: 패스 확인 없음.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import type { SimilarCandidate } from '../_shared/similarRecipes.ts';
import { handleSimilar, type SaveRow, type SimilarCardRow, type SimilarDeps } from './handler.ts';

// 점수에 필요한 열만 (조리 순서·영양 정보는 상위 6개만 fetchCards로)
const CANDIDATE_COLUMNS = 'id, recipe_name, ingredients, cuisine, method, spicy';
const CARD_COLUMNS =
  'id, recipe_name, image_uri, ingredients, cooking_steps, cooking_time, nutrition, is_zero_carb, week, created_at, uid';
// in() 목록이 URL에 실리므로 나눠 조회한다
const IN_CHUNK = 200;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size)
  );

const deps: SimilarDeps = {
  getUid,
  now: () => new Date(),

  async getStartDate(uid) {
    const { data, error } = await supabase
      .from('user')
      .select('start_date')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.start_date ?? null;
  },

  async fetchRecipe(id) {
    const { data, error } = await supabase
      .from('recipe')
      .select(CANDIDATE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as SimilarCandidate | null) ?? null;
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

  // 맞춤 추천과 같은 공개 범위: 이미지가 있는 레시피 중 week <= maxWeek
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
      return (data ?? []) as SimilarCandidate[];
    });
  },

  async fetchSaves(ids) {
    const pages = await Promise.all(
      chunks(ids, IN_CHUNK).map((part) =>
        fetchAllPages(async (from, to) => {
          const { data, error } = await supabase
            .from('saved_recipe')
            .select('recipe_id, uid, created_at')
            .in('recipe_id', part)
            .order('id')
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as SaveRow[];
        })
      )
    );
    return pages.flat();
  },

  async fetchCards(ids) {
    const { data, error } = await supabase.from('recipe').select(CARD_COLUMNS).in('id', ids);
    if (error) throw error;
    return (data ?? []) as SimilarCardRow[];
  },
};

serve((req: Request) => handleSimilar(req, deps));
