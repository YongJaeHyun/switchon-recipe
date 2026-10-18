import { Ingredient } from 'types/recipe';
import { describe, expect, it } from 'vitest';
import {
  buildAllWeekLists,
  buildLowIngredientLists,
  buildZeroIngredientLists,
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
