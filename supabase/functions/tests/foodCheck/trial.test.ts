import { describe, expect, it } from 'vitest';
import {
  FOOD_CHECK_TRIAL_LIMIT,
  foodCheckTrialRemaining,
  parseTrialConsume,
} from '../../_shared/foodCheckTrial.ts';

describe('FOOD_CHECK_TRIAL_LIMIT', () => {
  it('평생 3번', () => {
    expect(FOOD_CHECK_TRIAL_LIMIT).toBe(3);
  });
});

describe('parseTrialConsume', () => {
  it.each([2, 1, 0, -1])('정수 %i는 그대로', (n) => {
    expect(parseTrialConsume(n)).toBe(n);
  });

  it.each([null, undefined, '2', 1.5, -2, Number.NaN, {}])(
    '모양이 어긋나면(%s) 던진다 (402/허용으로 새지 않게)',
    (v) => {
      expect(() => parseTrialConsume(v)).toThrow();
    }
  );
});

describe('foodCheckTrialRemaining', () => {
  it('기록이 없으면 3번', () => {
    expect(foodCheckTrialRemaining(null)).toBe(3);
    expect(foodCheckTrialRemaining(undefined)).toBe(3);
  });

  it('쓴 만큼 빼고 0 아래로 내려가지 않는다', () => {
    expect(foodCheckTrialRemaining(0)).toBe(3);
    expect(foodCheckTrialRemaining(2)).toBe(1);
    expect(foodCheckTrialRemaining(3)).toBe(0);
    expect(foodCheckTrialRemaining(5)).toBe(0);
  });
});
