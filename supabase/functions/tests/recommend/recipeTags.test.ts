import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CUISINES,
  METHODS,
  RECIPE_TAG_BATCH_RESPONSE_SCHEMA,
  RECIPE_TAG_REQUIRED,
  RECIPE_TAG_RESPONSE_PROPERTIES,
  RECIPE_TAG_SCHEMA_PROMPT,
  buildRecipeTagBatchPrompt,
  parseRecipeTagBatchResponse,
  parseRecipeTags,
  recipeTagInputOf,
} from '../../_shared/recipeTags.ts';

describe('parseRecipeTags', () => {
  it('정상 태그를 그대로 돌려준다', () => {
    expect(parseRecipeTags({ spicy: true, cuisine: 'korean', method: 'soup' })).toEqual({
      spicy: true,
      cuisine: 'korean',
      method: 'soup',
    });
  });

  it('목록 밖 cuisine이면 null', () => {
    expect(parseRecipeTags({ spicy: false, cuisine: 'thai', method: 'soup' })).toBeNull();
  });

  it('목록 밖 method이면 null', () => {
    expect(parseRecipeTags({ spicy: false, cuisine: 'korean', method: 'fry' })).toBeNull();
  });

  it('spicy가 문자열 "true"이면 null', () => {
    expect(parseRecipeTags({ spicy: 'true', cuisine: 'korean', method: 'soup' })).toBeNull();
  });

  it('필드 누락, null, 비객체는 null', () => {
    expect(parseRecipeTags({ spicy: true, cuisine: 'korean' })).toBeNull();
    expect(parseRecipeTags(null)).toBeNull();
    expect(parseRecipeTags('x')).toBeNull();
    expect(parseRecipeTags(undefined)).toBeNull();
  });
});

describe('RECIPE_TAG_SCHEMA_PROMPT', () => {
  it('세 태그와 값 목록을 설명한다', () => {
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('spicy');
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('rice_bowl');
    expect(RECIPE_TAG_SCHEMA_PROMPT).toContain('japanese');
  });
});

describe('recipeTagInputOf', () => {
  it('재료 이름(옛 문자열·새 객체 모두)과 조리 단계 앞 3개를 뽑는다', () => {
    expect(
      recipeTagInputOf({
        id: 7,
        recipe_name: '두부조림',
        ingredients: JSON.stringify(['두부', { name: '간장', isOptional: false, amount: '1T' }]),
        cooking_steps: JSON.stringify(['a', 'b', 'c', 'd']),
      })
    ).toEqual({ id: 7, name: '두부조림', ingredients: ['두부', '간장'], steps: ['a', 'b', 'c'] });
  });

  it('JSON이 깨졌거나 비어 있으면 빈 목록', () => {
    expect(
      recipeTagInputOf({ id: 1, recipe_name: null, ingredients: '{', cooking_steps: null })
    ).toEqual({ id: 1, name: '', ingredients: [], steps: [] });
  });
});

describe('buildRecipeTagBatchPrompt', () => {
  it('태그 설명, 각 레시피의 id·이름·재료·단계, 배열 형식 지시를 담는다', () => {
    const prompt = buildRecipeTagBatchPrompt([
      { id: 3, name: '김치찌개', ingredients: ['김치', '두부'], steps: ['끓인다'] },
      { id: 9, name: '샐러드', ingredients: ['양상추'], steps: [] },
    ]);
    expect(prompt).toContain(RECIPE_TAG_SCHEMA_PROMPT);
    expect(prompt).toContain('"id":3');
    expect(prompt).toContain('김치찌개');
    expect(prompt).toContain('두부');
    expect(prompt).toContain('끓인다');
    expect(prompt).toContain('"id":9');
    expect(prompt).toMatch(/JSON array/);
  });
});

describe('parseRecipeTagBatchResponse', () => {
  const ids = [1, 2, 3];

  it('유효한 항목만 id와 태그로 돌려준다', () => {
    const text = JSON.stringify([
      { id: 1, spicy: true, cuisine: 'korean', method: 'soup' },
      { id: 2, spicy: 'no', cuisine: 'korean', method: 'soup' },
      { id: 3, spicy: false, cuisine: 'western', method: 'salad' },
    ]);
    expect(parseRecipeTagBatchResponse(text, ids)).toEqual([
      { id: 1, tags: { spicy: true, cuisine: 'korean', method: 'soup' } },
      { id: 3, tags: { spicy: false, cuisine: 'western', method: 'salad' } },
    ]);
  });

  it('배치에 없는 id·중복 id는 버린다 (첫 항목만)', () => {
    const text = JSON.stringify([
      { id: 99, spicy: true, cuisine: 'korean', method: 'soup' },
      { id: 1, spicy: true, cuisine: 'korean', method: 'soup' },
      { id: 1, spicy: false, cuisine: 'other', method: 'other' },
      { id: '2', spicy: true, cuisine: 'korean', method: 'soup' },
    ]);
    expect(parseRecipeTagBatchResponse(text, ids)).toEqual([
      { id: 1, tags: { spicy: true, cuisine: 'korean', method: 'soup' } },
    ]);
  });

  it('코드 펜스를 벗긴다', () => {
    const text = '```json\n[{"id":2,"spicy":false,"cuisine":"chinese","method":"stir_fry"}]\n```';
    expect(parseRecipeTagBatchResponse(text, ids)).toEqual([
      { id: 2, tags: { spicy: false, cuisine: 'chinese', method: 'stir_fry' } },
    ]);
  });

  it('JSON이 아니거나 배열이 아니면 빈 배열', () => {
    expect(parseRecipeTagBatchResponse('nope', ids)).toEqual([]);
    expect(parseRecipeTagBatchResponse('{"id":1}', ids)).toEqual([]);
  });
});

describe('RECIPE_TAG_BATCH_RESPONSE_SCHEMA', () => {
  it('{id, spicy, cuisine, method} 배열, 값 목록은 enum', () => {
    expect(RECIPE_TAG_BATCH_RESPONSE_SCHEMA).toEqual({
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          spicy: { type: 'BOOLEAN' },
          cuisine: { type: 'STRING', enum: [...CUISINES] },
          method: { type: 'STRING', enum: [...METHODS] },
        },
        required: ['id', 'spicy', 'cuisine', 'method'],
      },
    });
  });
});

describe('생성 responseSchema의 태그 필드', () => {
  it('값 목록은 CUISINES·METHODS, 세 태그는 required', () => {
    expect(RECIPE_TAG_RESPONSE_PROPERTIES).toEqual({
      spicy: { type: 'BOOLEAN' },
      cuisine: { type: 'STRING', enum: [...CUISINES] },
      method: { type: 'STRING', enum: [...METHODS] },
    });
    expect(RECIPE_TAG_REQUIRED).toEqual(['spicy', 'cuisine', 'method']);
  });

  // createRecipe.ts는 URL import(Deno) 때문에 Vitest에서 로드할 수 없어 소스로 확인한다
  const source = readFileSync(new URL('../../_shared/createRecipe.ts', import.meta.url), 'utf8');

  // 레시피 생성 요청 본문(응답 스키마)은 recipeText.ts에 있다
  const textSource = readFileSync(new URL('../../_shared/recipeText.ts', import.meta.url), 'utf8');

  it('레시피 생성이 공용 태그 스키마를 쓰고 enum 값을 따로 적지 않는다', () => {
    expect(textSource).toContain('...RECIPE_TAG_RESPONSE_PROPERTIES');
    expect(textSource).toContain("required: [...RECIPE_TAG_REQUIRED, 'servings']");
    expect(textSource).not.toMatch(/'stir_fry'|'korean'/);
    expect(source).not.toMatch(/'stir_fry'|'korean'/);
  });

  it('태그는 zod(RecipeSchema) 밖에서 해석해 빠져도 생성이 실패하지 않는다', () => {
    const zodBlock = source.slice(
      source.indexOf('const RecipeSchema'),
      source.indexOf('type Recipe =')
    );
    expect(zodBlock).not.toMatch(/spicy|cuisine|method/);
    expect(source).toContain('parseRecipeTags(recipeJson)');
    // 태그가 빠진 응답은 null → DB에는 null로 저장된다
    expect(parseRecipeTags({ recipeName: '두부조림', cookingTime: 10 })).toBeNull();
  });
});
