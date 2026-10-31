import { describe, expect, it } from 'vitest';
import {
  defaultChosenWeek,
  pruneSelectionForWeek,
  RECIPE_WEEK_CHOICES,
  recipeRuleWeek,
  recipeSaveWeek,
  weekChoiceLabel,
  weekPrunedMessage,
} from './recipeWeekChoice';

describe('RECIPE_WEEK_CHOICES / weekChoiceLabel', () => {
  it('1~4주차와 유지기(5)', () => {
    expect(RECIPE_WEEK_CHOICES).toEqual([1, 2, 3, 4, 5]);
    expect(RECIPE_WEEK_CHOICES.map(weekChoiceLabel)).toEqual([
      '1주차',
      '2주차',
      '3주차',
      '4주차',
      '유지기',
    ]);
  });
});

describe('defaultChosenWeek', () => {
  it('지금 주차 그대로 (1~4)', () => {
    expect(defaultChosenWeek(1)).toBe(1);
    expect(defaultChosenWeek(4)).toBe(4);
  });

  it('유지기(5주차 이상)는 5', () => {
    expect(defaultChosenWeek(5)).toBe(5);
    expect(defaultChosenWeek(12)).toBe(5);
  });

  it('이상한 값은 1주차', () => {
    expect(defaultChosenWeek(0)).toBe(1);
    expect(defaultChosenWeek(-3)).toBe(1);
    expect(defaultChosenWeek(Number.NaN)).toBe(1);
  });
});

describe('recipeRuleWeek / recipeSaveWeek', () => {
  it('규칙 주차는 4주차까지, 저장 주차는 3주차까지', () => {
    expect([1, 2, 3, 4, 5].map(recipeRuleWeek)).toEqual([1, 2, 3, 4, 4]);
    expect([1, 2, 3, 4, 5].map(recipeSaveWeek)).toEqual([1, 2, 3, 3, 3]);
  });
});

describe('pruneSelectionForWeek', () => {
  const a = { name: '달걀', week: 1 };
  const b = { name: '두부', week: 2 };
  const c = { name: '견과류', week: 3 };

  it('고른 주차에 못 쓰는 재료를 뺀다', () => {
    expect(pruneSelectionForWeek([a, b, c], 1)).toEqual({ kept: [a], removed: [b, c] });
    expect(pruneSelectionForWeek([a, b, c], 2)).toEqual({ kept: [a, b], removed: [c] });
  });

  it('다 쓸 수 있으면 removed가 비어 있다', () => {
    expect(pruneSelectionForWeek([a, b, c], 4)).toEqual({ kept: [a, b, c], removed: [] });
    expect(pruneSelectionForWeek([], 1)).toEqual({ kept: [], removed: [] });
  });
});

describe('weekPrunedMessage', () => {
  it('주차 이름을 넣는다', () => {
    expect(weekPrunedMessage(2)).toBe('2주차에 못 쓰는 재료는 뺐어요');
    expect(weekPrunedMessage(5)).toBe('유지기에 못 쓰는 재료는 뺐어요');
  });
});
