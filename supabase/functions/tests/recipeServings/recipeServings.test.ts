import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECIPE_SERVINGS_BATCH_RESPONSE_SCHEMA,
  buildServingsBatchPrompt,
  parseServings,
  parseServingsBatchResponse,
  servingsInputOf,
} from '../../_shared/recipeServings.ts';

describe('parseServings', () => {
  it('1~8 정수만 받는다', () => {
    expect(parseServings(1)).toBe(1);
    expect(parseServings(8)).toBe(8);
    for (const v of [0, 9, 1.5, '2', null, undefined, Number.NaN]) {
      expect(parseServings(v)).toBeNull();
    }
  });
});

describe('servingsInputOf', () => {
  it('재료는 이름과 양을 함께, 옛 형식 문자열은 그대로, 조리 단계는 앞 3개만', () => {
    const input = servingsInputOf({
      id: 7,
      recipe_name: '두부조림',
      ingredients: JSON.stringify([
        { name: '돼지고기 앞다리살', isOptional: false, amount: '200g' },
        { name: '후추', isOptional: false, amount: '' },
        '두부 1모',
        { amount: '1개' },
      ]),
      cooking_steps: JSON.stringify(['a', 'b', 'c', 'd']),
    });
    expect(input).toEqual({
      id: 7,
      name: '두부조림',
      ingredients: ['돼지고기 앞다리살 200g', '후추', '두부 1모'],
      steps: ['a', 'b', 'c'],
    });
  });

  it('깨진 JSON은 빈 목록', () => {
    expect(
      servingsInputOf({ id: 1, recipe_name: null, ingredients: '{', cooking_steps: null })
    ).toEqual({ id: 1, name: '', ingredients: [], steps: [] });
  });
});

describe('buildServingsBatchPrompt', () => {
  it('레시피마다 한 줄 JSON과 응답 형식을 담는다', () => {
    const prompt = buildServingsBatchPrompt([
      { id: 3, name: '김치찌개', ingredients: ['김치 200g'], steps: ['끓인다'] },
    ]);
    expect(prompt).toContain(
      '{"id":3,"name":"김치찌개","ingredients":["김치 200g"],"steps":["끓인다"]}'
    );
    expect(prompt).toContain('integer from 1 to 8');
    expect(prompt).toContain('[{"id": <recipe id>, "servings": <integer>}]');
  });
});

describe('parseServingsBatchResponse', () => {
  it('배치 id이고 유효한 항목만, 중복 id는 첫 항목만', () => {
    const text = JSON.stringify([
      { id: 1, servings: 2 },
      { id: 1, servings: 3 },
      { id: 2, servings: 12 },
      { id: 3, servings: '1' },
      { id: 99, servings: 1 },
      { id: 4, servings: 1 },
      null,
    ]);
    expect(parseServingsBatchResponse(text, [1, 2, 3, 4])).toEqual([
      { id: 1, servings: 2 },
      { id: 4, servings: 1 },
    ]);
  });

  it('코드 블록을 벗기고, JSON 배열이 아니면 빈 목록', () => {
    expect(parseServingsBatchResponse('```json\n[{"id":1,"servings":1}]\n```', [1])).toEqual([
      { id: 1, servings: 1 },
    ]);
    expect(parseServingsBatchResponse('nope', [1])).toEqual([]);
    expect(parseServingsBatchResponse('{"id":1}', [1])).toEqual([]);
  });

  it('응답 스키마가 id·servings를 요구한다', () => {
    expect(RECIPE_SERVINGS_BATCH_RESPONSE_SCHEMA.items.required).toEqual(['id', 'servings']);
  });
});

// createRecipe.ts는 URL import(Deno) 때문에 Vitest에서 로드할 수 없어 소스로 확인한다
describe('createRecipe.ts 기준 인분', () => {
  const src = readFileSync(new URL('../../_shared/createRecipe.ts', import.meta.url), 'utf8');
  const flat = src.replace(/\s+/g, ' ');

  it('응답 스키마와 system instruction에 인분을 넣는다', () => {
    expect(src).toContain('...RECIPE_SERVINGS_RESPONSE_PROPERTY');
    expect(flat).toContain("RECIPE_TAG_SCHEMA_PROMPT + ' ' + RECIPE_SERVINGS_PROMPT");
    expect(src).toContain("required: [...RECIPE_TAG_REQUIRED, 'servings']");
  });

  it('인분이 빠지거나 잘못돼도 생성은 실패하지 않고 null로 저장한다', () => {
    // zod에서 실패시키지 않고 parseServings로 1~8 정수가 아니면 null로 바꾼다
    const zodBlock = src.slice(src.indexOf('const RecipeSchema'), src.indexOf('type Recipe ='));
    expect(zodBlock.replace(/\s+/g, ' ')).toContain(
      'servings: z.unknown().transform((v) => parseServings(v)),'
    );
    expect(src).toContain('servings: validated.servings,');
  });
});

describe('20261030000000_recipe_servings.sql', () => {
  const sql = readFileSync(
    new URL('../../../migrations/20261030000000_recipe_servings.sql', import.meta.url),
    'utf8'
  ).replace(/\s+/g, ' ');

  it('1~10 범위의 null 허용 smallint 열을 더한다', () => {
    expect(sql).toContain(
      'alter table public.recipe add column if not exists servings smallint null constraint recipe_servings_range check (servings between 1 and 10);'
    );
  });

  it('뷰와 두 RPC가 맨 뒤 열로 servings를 돌려준다', () => {
    expect(sql).toContain(
      'COALESCE(all_saved.total_count, 0::bigint) AS saved_count, r.servings FROM recipe r'
    );
    expect(sql).toContain('with (security_invoker = on)');
    expect(sql.match(/saved_at timestamp with time zone, servings smallint\)/g)).toHaveLength(2);
    expect(
      sql.match(/us\.created_at AS saved_at, r\.servings FROM filtered_recipes r/g)
    ).toHaveLength(2);
  });

  it('drop한 RPC의 실행 권한을 되돌리고 정책은 바꾸지 않는다', () => {
    expect(sql).toContain(
      'grant execute on function public.search_recipes(integer, text, text, text) to public, anon, authenticated, service_role;'
    );
    expect(sql).toContain(
      'grant execute on function public.search_saved_recipes(integer, text, text) to public, anon, authenticated, service_role;'
    );
    expect(sql).not.toMatch(/(create|drop|alter) policy/i);
  });
});

describe('카드 행에 servings를 싣는 엣지 함수', () => {
  it.each(['similar-recipes', 'recommend-recipes'])(
    '%s의 CARD_COLUMNS에 servings가 있다',
    (name) => {
      const index = readFileSync(new URL(`../../${name}/index.ts`, import.meta.url), 'utf8');
      expect(index.replace(/\s+/g, ' ')).toContain(
        "nutrition, is_zero_carb, week, created_at, uid, servings';"
      );
    }
  );
});
