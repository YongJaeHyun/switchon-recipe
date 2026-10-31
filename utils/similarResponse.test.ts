import { describe, expect, it } from 'vitest';
import { parseSimilarResponse } from './similarResponse';

const row = {
  id: 7,
  recipe_name: '두부 김치 볶음',
  image_uri: 'https://example.com/a.png',
  ingredients: '[{"name":"두부","amount":"1모","isOptional":false}]',
  cooking_steps: '["굽는다"]',
  cooking_time: 15,
  nutrition: '{}',
  is_zero_carb: false,
  week: 2,
  created_at: '2026-10-01T00:00:00Z',
  uid: null,
  is_saved: true,
  saved_at: '2026-10-02T00:00:00Z',
  saved_count: 3,
  servings: 2,
};

describe('parseSimilarResponse', () => {
  it('recipe_with_is_saved 행 모양 그대로 돌려준다', () => {
    expect(parseSimilarResponse({ recipes: [row] })).toEqual([row]);
  });

  it('id나 재료가 없는 행은 빼고, 빠진 값은 기본값으로', () => {
    const result = parseSimilarResponse({
      recipes: [
        { ...row, id: '7' },
        { ...row, ingredients: null },
        { id: 8, ingredients: '[]' },
        // 범위 밖·정수가 아닌 인분은 null
        { id: 9, ingredients: '[]', servings: 1.5 },
        null,
      ],
    });
    expect(result).toEqual([
      {
        id: 8,
        recipe_name: null,
        image_uri: null,
        ingredients: '[]',
        cooking_steps: null,
        cooking_time: null,
        nutrition: null,
        is_zero_carb: null,
        week: null,
        created_at: null,
        uid: null,
        is_saved: false,
        saved_at: null,
        saved_count: 0,
        servings: null,
      },
      expect.objectContaining({ id: 9, servings: null }),
    ]);
  });

  it('recipes가 배열이 아니면 null', () => {
    expect(parseSimilarResponse(null)).toBeNull();
    expect(parseSimilarResponse({ recipes: 'x' })).toBeNull();
    expect(parseSimilarResponse([])).toBeNull();
  });
});
