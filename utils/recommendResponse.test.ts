import { describe, expect, it } from 'vitest';
import { interpretRecommendResponse, savedEntriesOf } from './recommendResponse';

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
};

describe('interpretRecommendResponse', () => {
  it('200: 카드 행을 RecipeDB 모양으로 (태그 열은 null)', () => {
    const outcome = interpretRecommendResponse(200, { recipes: [row], totalMatches: 12 });
    expect(outcome).toEqual({
      status: 'ok',
      totalMatches: 12,
      recipes: [
        {
          id: 7,
          recipe_name: '두부 김치 볶음',
          image_uri: 'https://example.com/a.png',
          ingredients: row.ingredients,
          cooking_steps: row.cooking_steps,
          cooking_time: 15,
          nutrition: '{}',
          is_zero_carb: false,
          week: 2,
          created_at: row.created_at,
          uid: null,
          spicy: null,
          cuisine: null,
          method: null,
          ingredient_tags: [],
          is_saved: true,
          saved_count: 3,
        },
      ],
    });
  });

  it('200 빈 목록', () => {
    expect(interpretRecommendResponse(200, { recipes: [], totalMatches: 0 })).toEqual({
      status: 'ok',
      recipes: [],
      totalMatches: 0,
    });
  });

  it('200 쉐이크 끼니', () => {
    expect(
      interpretRecommendResponse(200, { recipes: [], totalMatches: 0, reason: 'shake' })
    ).toEqual({ status: 'shake' });
  });

  it('모양이 어긋난 행은 뺀다 (id·재료 없음), 저장 정보가 없으면 false·0', () => {
    const outcome = interpretRecommendResponse(200, {
      recipes: [
        { ...row, id: 'x' },
        { ...row, id: 8, ingredients: null },
        { ...row, id: 9, is_saved: undefined, saved_count: undefined },
        null,
      ],
      totalMatches: 3,
    });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.recipes.map((r) => r.id)).toEqual([9]);
    expect(outcome.recipes[0].is_saved).toBe(false);
    expect(outcome.recipes[0].saved_count).toBe(0);
  });

  it('totalMatches가 없으면 받은 개수', () => {
    const outcome = interpretRecommendResponse(200, { recipes: [row] });
    expect(outcome).toMatchObject({ status: 'ok', totalMatches: 1 });
  });

  it('200인데 recipes가 배열이 아니면 error', () => {
    expect(interpretRecommendResponse(200, { foo: 1 }).status).toBe('error');
    expect(interpretRecommendResponse(200, null).status).toBe('error');
  });

  it('402는 locked', () => {
    expect(interpretRecommendResponse(402, { code: 'PREMIUM_REQUIRED' })).toEqual({
      status: 'locked',
    });
  });

  it('400은 서버 메시지', () => {
    expect(interpretRecommendResponse(400, { error: 'mustInclude는 최대 2개입니다' })).toEqual({
      status: 'invalid',
      message: 'mustInclude는 최대 2개입니다',
    });
    expect(interpretRecommendResponse(400, {})).toMatchObject({ status: 'invalid' });
  });

  it('그 밖의 상태는 error', () => {
    expect(interpretRecommendResponse(500, { error: 'x' })).toEqual({
      status: 'error',
      message: '추천에 실패했어요. 잠시 후 다시 시도해 주세요',
    });
    expect(interpretRecommendResponse(401, {}).status).toBe('error');
  });
});

describe('savedEntriesOf', () => {
  it('저장 여부 맵 시드용 [id, is_saved]', () => {
    expect(
      savedEntriesOf([
        { id: 1, is_saved: true },
        { id: 2, is_saved: false },
      ])
    ).toEqual({ 1: true, 2: false });
  });
});
