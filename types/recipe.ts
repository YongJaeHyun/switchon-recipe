import { z } from 'zod';
import { Nullable } from './common';

interface Ingredient {
  name: string;
  subKeywords?: string[];
  week: number;
  image: string;
  isCarbohydrate?: boolean;
}

const IngredientSchema = z.object({
  name: z.string(),
  isOptional: z.boolean(),
  amount: z.string(),
});
type RecipeIngredient = string | z.infer<typeof IngredientSchema>;

const RecipeSchema = z.object({
  recipeName: z.string(),
  cookingTime: z.number(),
  nutrition: z.object({
    carbohydrates: z.number(),
    protein: z.number(),
    fat: z.number(),
    fiber: z.number(),
    sugar: z.number(),
  }),
  ingredients: z.array(IngredientSchema),
  cookingSteps: z.array(z.string()),
  imageUri: z.string().nullish(),
});
type Recipe = z.infer<typeof RecipeSchema>;

type RecipeCategory = '한식' | '중식' | '일식' | '양식';
type RecipeMethod = '샐러드류' | '구이류' | '볶음류' | '덮밥류' | '탕/국류' | '찜류';
type RecipeOption = RecipeCategory | RecipeMethod;

interface RecipeOptions {
  category: Nullable<RecipeCategory>;
  method: Nullable<RecipeMethod>;
}

export {
  Ingredient,
  IngredientSchema,
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  RecipeMethod,
  RecipeOption,
  RecipeOptions,
  RecipeSchema,
};
