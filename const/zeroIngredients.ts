import { IngredientsProps } from 'components/recipeCreation/Ingredients';
import { Ingredient } from 'types/recipe';
import {
  carbohydrateIngredients,
  firstWeekIngredients,
  secondWeekIngredients,
  thirdWeekIngredients,
} from './ingredients';

const isZeroIngredient = (ingredient: Ingredient) =>
  !carbohydrateIngredients.some((carboIngredient) => carboIngredient.name === ingredient.name);

export const firstWeekZeroIngredients: Ingredient[] = firstWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const secondWeekZeroIngredients: Ingredient[] = secondWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const thirdWeekZeroIngredients: Ingredient[] = thirdWeekIngredients.filter((ingredient) =>
  isZeroIngredient(ingredient)
);

export const allZeroIngredientsList: IngredientsProps[] = [
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
