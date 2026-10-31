import { describe, expect, it } from 'vitest';
import { parseSimilarResponse, similarWeekOf } from './similarResponse';

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

// 캐시 키에 넣는 주차: 서버가 후보를 이 주차까지로 자르므로 (similar-recipes MAX_SIMILAR_WEEK = 4)
describe('similarWeekOf', () => {
  it('지금 주차, 4주차 위는 4, 시작 전·시작일 없음은 1', () => {
    expect(similarWeekOf('2026-10-01', '2026-10-17')).toBe(3);
    expect(similarWeekOf('2026-08-01', '2026-10-17')).toBe(4);
    expect(similarWeekOf('2026-10-20', '2026-10-17')).toBe(1);
    expect(similarWeekOf(null, '2026-10-17')).toBe(1);
  });

  it('한 주 더 하기로 시작일이 미뤄지면 주차가 바뀐다 (키가 바뀌어 새로 받는다)', () => {
    expect(similarWeekOf('2026-10-08', '2026-10-17')).toBe(2);
  });
});
