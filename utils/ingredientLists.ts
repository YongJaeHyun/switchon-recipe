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

// 레시피 요청에 넣을 선택 재료: 지금 주차에 먹을 수 있는 것만 (재료 칸의 잠금 ingredient.week > userWeek과 같은 기준).
// 시작일을 바꿨을 때 선택 목록을 못 불러와 정리를 못 했어도, 잠긴 재료를 레시피 명령에 보내지 않는다
export const ingredientsForWeek = <T extends { week: number }>(list: T[], userWeek: number): T[] =>
  list.filter((ingredient) => ingredient.week <= userWeek);
