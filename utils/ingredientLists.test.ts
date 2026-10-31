import { Ingredient } from 'types/recipe';
import { describe, expect, it } from 'vitest';
import {
  buildAllWeekLists,
  buildLowIngredientLists,
  buildZeroIngredientLists,
  ingredientsForWeek,
} from './ingredientLists';

const ingredient = (name: string, week: number, isCarbohydrate?: boolean): Ingredient => ({
  name,
  week,
  image: `https://img/${name}.jpg`,
  isCarbohydrate,
});

const list = [
  ingredient('계란', 1),
  ingredient('현미밥', 3, true),
  ingredient('두부', 2),
  ingredient('바나나', 3, true),
];

const names = (ingredients: Ingredient[]) => ingredients.map((i) => i.name);

describe('buildLowIngredientLists', () => {
  it('puts carbohydrates first as week 4, then weeks 1 to 3', () => {
    const lists = buildLowIngredientLists(list);

    expect(lists.map((l) => l.title)).toEqual(['탄수화물', '1주차', '2주차', '3주차 +']);
    expect(lists.map((l) => l.week)).toEqual([4, 1, 2, 3]);
    expect(names(lists[0].ingredientList)).toEqual(['현미밥', '바나나']);
    expect(names(lists[1].ingredientList)).toEqual(['계란']);
  });
});

describe('buildZeroIngredientLists', () => {
  it('excludes carbohydrates', () => {
    const lists = buildZeroIngredientLists(list);

    expect(lists.map((l) => l.title)).toEqual(['1주차', '2주차', '3주차 +']);
    expect(names(lists[2].ingredientList)).toEqual([]);
  });
});

describe('buildAllWeekLists', () => {
  it('includes carbohydrates in their own week', () => {
    const lists = buildAllWeekLists(list);

    expect(lists.map((l) => l.week)).toEqual([1, 2, 3]);
    expect(names(lists[2].ingredientList)).toEqual(['현미밥', '바나나']);
  });
});

describe('ingredientsForWeek', () => {
  it('지금 주차보다 높은 주차 재료는 뺀다 (한 주 더 하기로 주차가 내려갔는데 정리를 못 한 경우)', () => {
    expect(ingredientsForWeek(list, 2).map((i) => i.name)).toEqual(['계란', '두부']);
    expect(ingredientsForWeek(list, 3)).toEqual(list);
  });
});
