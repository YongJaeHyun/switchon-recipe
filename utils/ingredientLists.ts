import type { IngredientsProps } from 'components/recipeCreation/Ingredients';
import { Ingredient } from 'types/recipe';

const weekTitles = [
  { title: '1주차', week: 1 },
  { title: '2주차', week: 2 },
  { title: '3주차 +', week: 3 },
];

const byWeek = (list: Ingredient[]): IngredientsProps[] =>
  weekTitles.map(({ title, week }) => ({
    title,
    week,
    ingredientList: list.filter((i) => i.week === week),
  }));

export const buildAllWeekLists = (list: Ingredient[]) => byWeek(list);

export const buildZeroIngredientLists = (list: Ingredient[]) =>
  byWeek(list.filter((i) => !i.isCarbohydrate));

export const buildLowIngredientLists = (list: Ingredient[]): IngredientsProps[] => [
  { title: '탄수화물', week: 4, ingredientList: list.filter((i) => i.isCarbohydrate) },
  ...byWeek(list),
];
