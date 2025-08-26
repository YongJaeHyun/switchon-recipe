import { IngredientsProps } from 'components/recipeCreation/Ingredients';
import { IIngredient } from 'types/recipe';
import {
  carbohydrateIngredients,
  firstWeekIngredients,
  secondWeekIngredients,
  thirdWeekIngredients,
} from './ingredients';

const isZeroIngredient = (ingredient: IIngredient) =>
  !carbohydrateIngredients.some((carboIngredient) => carboIngredient.name === ingredient.name);

export const firstWeekZeroIngredients: IIngredient[] = firstWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const secondWeekZeroIngredients: IIngredient[] = secondWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const thirdWeekZeroIngredients: IIngredient[] = thirdWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const allZeroIngredients: IngredientsProps[] = [
  {
    title: '1주차',
    week: 1,
    ingredientList: firstWeekZeroIngredients,
  },
  {
    title: '2주차',
    week: 2,
    ingredientList: secondWeekZeroIngredients,
  },
  {
    title: '3주차 +',
    week: 3,
    ingredientList: thirdWeekZeroIngredients,
  },
];
