import { ImageSource } from 'expo-image';
import { z } from 'zod';

interface IIngredient {
  name: string;
  image: ImageSource;
}

const RecipeSchema = z.object({
  recipeName: z.string(),
  imageUri: z.string().nullish(),
  cookingTime: z.number(),
  ingredients: z.array(z.string()),
  cookingSteps: z.array(z.string()),
  nutrition: z.object({
    carbohydrates: z.number(),
    protein: z.number(),
    fat: z.number(),
    fiber: z.number(),
    sugar: z.number(),
  }),
});
type Recipe = z.infer<typeof RecipeSchema>;

export { IIngredient, Recipe, RecipeSchema };
