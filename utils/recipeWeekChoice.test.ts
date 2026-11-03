import { describe, expect, it } from 'vitest';
import {
  defaultChosenWeek,
  pruneSelectionForWeek,
  RECIPE_WEEK_CHOICES,
  recipeRuleWeek,
  recipeSaveWeek,
  restoreChosenWeek,
  ingredientRecipeWeek,
  weekChoiceLabel,
  weekPrunedMessage,
  NAME_WEEK_CHOICES,
  nameWeekLabel,
  defaultNameWeekChoice,
  nameRequestWeek,
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

describe('restoreChosenWeek', () => {
  const w = (week: number) => ({ week });

  it('기억한 주차가 없으면 지금 주차', () => {
    expect(restoreChosenWeek({ remembered: undefined, currentWeek: 2, selected: [] })).toBe(2);
  });

  it('기억한 주차가 있으면 그대로 (앞·뒤 주차 모두)', () => {
    expect(
      restoreChosenWeek({ remembered: { week: 4, currentWeek: 2 }, currentWeek: 2, selected: [] })
    ).toBe(4);
    expect(
      restoreChosenWeek({ remembered: { week: 1, currentWeek: 3 }, currentWeek: 3, selected: [] })
    ).toBe(1);
  });

  it('그 사이 지금 주차가 바뀌었으면 기억을 버리고 지금 주차', () => {
    expect(
      restoreChosenWeek({ remembered: { week: 4, currentWeek: 2 }, currentWeek: 3, selected: [] })
    ).toBe(3);
  });

  it('선택 재료에 더 높은 주차 재료가 있으면 그 주차까지 올린다 (재료를 빼지 않는다)', () => {
    expect(
      restoreChosenWeek({ remembered: undefined, currentWeek: 1, selected: [w(1), w(3)] })
    ).toBe(3);
    expect(
      restoreChosenWeek({
        remembered: { week: 2, currentWeek: 1 },
        currentWeek: 1,
        selected: [w(4)],
      })
    ).toBe(4);
  });

  it('선택 재료가 고른 주차 이하면 고른 주차 그대로', () => {
    expect(
      restoreChosenWeek({
        remembered: { week: 3, currentWeek: 1 },
        currentWeek: 1,
        selected: [w(1), w(2)],
      })
    ).toBe(3);
  });

  it('유지기(5)를 넘지 않는다', () => {
    expect(restoreChosenWeek({ remembered: undefined, currentWeek: 5, selected: [w(9)] })).toBe(5);
  });
});

describe('이름으로 만들기 주차 (1주차 / 2주차 / 3주차+)', () => {
  it('칸은 1·2·3이고 3은 "3주차+"', () => {
    expect(NAME_WEEK_CHOICES).toEqual([1, 2, 3]);
    expect(nameWeekLabel(1)).toBe('1주차');
    expect(nameWeekLabel(3)).toBe('3주차+');
  });

  it('처음 고른 칸은 지금 주차, 3주차 이후(유지기 포함)는 3주차+', () => {
    expect(defaultNameWeekChoice(1)).toBe(1);
    expect(defaultNameWeekChoice(2)).toBe(2);
    expect(defaultNameWeekChoice(4)).toBe(3);
    expect(defaultNameWeekChoice(6)).toBe(3);
    expect(defaultNameWeekChoice(0)).toBe(1);
  });

  it('3주차+를 고르면 지금이 3주차 이후일 때 지금 주차 규칙으로, 아니면 3주차 규칙으로 보낸다', () => {
    expect(nameRequestWeek(3, 4)).toBe(4);
    expect(nameRequestWeek(3, 5)).toBe(5);
    expect(nameRequestWeek(3, 7)).toBe(5);
    expect(nameRequestWeek(3, 1)).toBe(3);
    expect(nameRequestWeek(2, 4)).toBe(2);
  });
});

describe('ingredientRecipeWeek', () => {
  const w = (week: number) => ({ week });

  it('고른 재료 중 가장 높은 주차 (지금 3주차라도 2주차 재료만이면 2주차)', () => {
    expect(ingredientRecipeWeek([w(1), w(2)], 3)).toBe(2);
    expect(ingredientRecipeWeek([w(1)], 5)).toBe(1);
    expect(ingredientRecipeWeek([w(2), w(3)], 3)).toBe(3);
  });

  it('저탄수 탄수화물 재료(4)는 그대로 4 → 규칙 4주차, 저장 3주차', () => {
    expect(ingredientRecipeWeek([w(2), w(4)], 4)).toBe(4);
  });

  it('고른 주차를 넘지 않는다', () => {
    expect(ingredientRecipeWeek([w(3)], 2)).toBe(2);
  });

  it('재료 없이 아무거나 만들면 고른 주차', () => {
    expect(ingredientRecipeWeek([], 3)).toBe(3);
  });

  it('주차를 모르는 재료는 1주차로 본다', () => {
    expect(ingredientRecipeWeek([w(Number.NaN)], 3)).toBe(1);
  });
});
