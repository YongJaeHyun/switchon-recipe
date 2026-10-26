import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 마이그레이션과 레시피 생성(URL import라 Vitest로 못 돌림) 연결을 글자 단위로 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('20261026000000_recipe_ingredient_tags.sql', () => {
  const sql = flat(read('../../../migrations/20261026000000_recipe_ingredient_tags.sql'));

  it('빈 배열 기본값의 not null text[] 열을 더한다', () => {
    expect(sql).toContain(
      "alter table public.recipe add column if not exists ingredient_tags text[] not null default '{}';"
    );
  });

  it('배열 포함 검색용 GIN 인덱스를 만든다', () => {
    expect(sql).toContain(
      'create index if not exists recipe_ingredient_tags_idx on public.recipe using gin (ingredient_tags);'
    );
  });

  it('정책·권한은 바꾸지 않는다', () => {
    expect(sql).not.toMatch(/^\s*(create|drop|alter) policy|^\s*(grant|revoke) /im);
  });
});

describe('createRecipe.ts 재료 태그 저장', () => {
  const src = read('../../_shared/createRecipe.ts');

  it('등록 재료(is_active)를 service role 클라이언트로 페이지 단위로 읽어 태그를 만든다', () => {
    expect(flat(src)).toMatch(
      /loadIngredientTags\( \(\) => fetchAllPages\(async \(from, to\) => \{ const \{ data, error \} = await adminClient \.from\('ingredient'\) \.select\('name, sub_keywords'\) \.eq\('is_active', true\)/
    );
  });

  it('insert에 ingredient_tags를 넣고 재료 문구는 그대로 저장한다', () => {
    expect(src).toContain('ingredients: ingredientsJson,');
    expect(src).toContain('ingredient_tags: ingredientTags,');
    expect(src).toContain('const ingredientsJson = JSON.stringify(validated.ingredients);');
  });
});
