import { describe, expect, it } from 'vitest';
import { nutritionPerServing } from './nutritionPerServing';

const total = { carbohydrates: 15, protein: 58, fat: 45, fiber: 4, sugar: 5 };

describe('nutritionPerServing', () => {
  it('기준 인분으로 나눠 1인분 값으로 (반올림)', () => {
    expect(nutritionPerServing(total, 2)).toEqual({
      carbohydrates: 8,
      protein: 29,
      fat: 23,
      fiber: 2,
      sugar: 3,
    });
  });

  it('1인분이거나 기준 인분을 모르면 그대로', () => {
    expect(nutritionPerServing(total, 1)).toEqual(total);
    expect(nutritionPerServing(total, null)).toEqual(total);
  });

  it('숫자가 아닌 값은 그대로 둔다', () => {
    expect(
      nutritionPerServing({ ...total, protein: '약 20' as unknown as number }, 2).protein
    ).toBe('약 20');
  });
});
