// 기존 레시피의 검색용 재료 태그(recipe.ingredient_tags) 백필 (일회성, 다시 돌려도 안전).
// 마이그레이션 20261026000000_recipe_ingredient_tags.sql을 적용한 뒤 실행한다.
// 등록 재료(ingredient, is_active)를 읽어 레시피를 id 순으로 페이지 단위로 읽고, 계산한 태그가 지금 값과 다른 행만 고친다.
// 등록 재료가 바뀐 뒤(새 재료 추가·sub_keywords 수정) 다시 돌리면 달라진 행만 갱신한다.
//
// 엣지 함수 공용 모듈(_shared, Deno용 .ts 확장자 import)을 그대로 쓰므로 Deno로 실행한다 (엣지 함수 배포는 필요 없다).
// 앱 tsconfig에서는 빼고(exclude) deno check로 타입을 확인한다.
//
// 실행:
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//     deno run --no-lock --allow-net --allow-env scripts/backfillIngredientTags.ts --dry-run   # 바꿀 행 수와 예시 10개만 출력
//   (위와 같은 환경변수) deno run --no-lock --allow-net --allow-env scripts/backfillIngredientTags.ts   # 실제 갱신

/// <reference lib="deno.ns" />

// eslint-disable-next-line import/no-unresolved -- Deno URL import (엣지 함수와 같은 방식)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { RegisteredIngredient } from '../supabase/functions/_shared/ingredientNormalize.ts';
import { fetchAllPages } from '../supabase/functions/_shared/pagination.ts';
import {
  buildIngredientTagMatcher,
  planIngredientTagUpdates,
  type TagBackfillRow,
} from '../supabase/functions/_shared/recipeIngredientTags.ts';

const SAMPLE_COUNT = 10;

const main = async () => {
  const dryRun = Deno.args.includes('--dry-run');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error(
      '❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되어 있지 않습니다.'
    );
    Deno.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const registered = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('ingredient')
      .select('name, sub_keywords')
      .eq('is_active', true)
      .order('id')
      .range(from, to);
    if (error) throw new Error(`등록 재료 조회 실패: ${error.message}`);
    return (data ?? []) as RegisteredIngredient[];
  });
  if (registered.length === 0) throw new Error('등록 재료가 0개입니다. 중단합니다.');

  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('recipe')
      .select('id, recipe_name, ingredients, ingredient_tags')
      .order('id')
      .range(from, to);
    if (error) {
      throw new Error(
        `레시피 조회 실패 (마이그레이션 20261026000000 적용 여부 확인): ${error.message}`
      );
    }
    return (data ?? []) as (TagBackfillRow & { recipe_name: string | null })[];
  });

  const updates = planIngredientTagUpdates(rows, buildIngredientTagMatcher(registered));
  const names = new Map(rows.map((r) => [r.id, r.recipe_name]));
  const emptyAfter = updates.filter((u) => u.tags.length === 0).length;

  console.log(
    `등록 재료 ${registered.length}개, 레시피 ${rows.length}개 → 바꿀 행 ${updates.length}개 ` +
      `(그대로 ${rows.length - updates.length}개, 바뀐 뒤 빈 태그 ${emptyAfter}개)`
  );
  for (const u of updates.slice(0, SAMPLE_COUNT)) {
    console.log(
      `  #${u.id} ${names.get(u.id) ?? ''}: [${u.before.join(', ')}] → [${u.tags.join(', ')}]`
    );
  }

  if (dryRun) {
    console.log('--dry-run: 아무것도 바꾸지 않았습니다.');
    return;
  }

  let done = 0;
  const failed: number[] = [];
  for (const u of updates) {
    const { error } = await supabase
      .from('recipe')
      .update({ ingredient_tags: u.tags })
      .eq('id', u.id);
    if (error) {
      failed.push(u.id);
      console.error(`  #${u.id} 갱신 실패: ${error.message}`);
    } else {
      done++;
    }
  }
  console.log(
    `✅ 갱신 ${done}개, 실패 ${failed.length}개${failed.length ? ` (${failed.join(', ')})` : ''}`
  );
  if (failed.length) Deno.exit(1);
};

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  Deno.exit(1);
});
