import { describe, expect, it } from 'vitest';
import { hasRecipeFieldShapes, parseRecipeFields } from './recipeFields';

describe('parseRecipeFields (레시피 상세가 모양이 틀린 칸에도 죽지 않게)', () => {
  it('멀쩡하면 그대로 꺼낸다', () => {
    expect(
      parseRecipeFields({
        ingredients: JSON.stringify([{ name: '두부' }]),
        cooking_steps: JSON.stringify(['굽는다']),
        nutrition: JSON.stringify({ calories: 200 }),
      })
    ).toEqual({
      ingredients: [{ name: '두부' }],
      cookingSteps: ['굽는다'],
      nutrition: { calories: 200 },
    });
  });

  it('없거나 깨졌거나 모양이 틀리면 빈 값', () => {
    const empty = { ingredients: [], cookingSteps: [], nutrition: {} };
    expect(
      parseRecipeFields({ ingredients: 'null', cooking_steps: '5', nutrition: 'null' })
    ).toEqual(empty);
    expect(parseRecipeFields({ ingredients: '{', cooking_steps: null, nutrition: '[]' })).toEqual(
      empty
    );
    expect(parseRecipeFields({})).toEqual(empty);
  });
});

describe('hasRecipeFieldShapes (카톡 링크로 받은 레시피 검사)', () => {
  it('재료·조리 순서는 배열, 영양은 객체', () => {
    expect(
      hasRecipeFieldShapes({ ingredients: '[]', cooking_steps: '["a"]', nutrition: '{}' })
    ).toBe(true);
    expect(
      hasRecipeFieldShapes({ ingredients: 'null', cooking_steps: '5', nutrition: 'null' })
    ).toBe(false);
    expect(hasRecipeFieldShapes({ ingredients: '[]', cooking_steps: '[]', nutrition: '[]' })).toBe(
      false
    );
    expect(hasRecipeFieldShapes({ ingredients: 3, cooking_steps: '[]', nutrition: '{}' })).toBe(
      false
    );
  });
});
