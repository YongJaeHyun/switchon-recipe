import { ImageSource } from 'expo-image';

interface IIngredient {
  name: string;
  image: ImageSource;
}

interface Recipe {
  recipeName: string;
  imageUri: string | null;
  cookingTime: number;
  ingredients: string[];
  cookingSteps: string[];
  nutrition: {
    carbohydrates: number;
    protein: number;
    fat: number;
    fiber: number;
    sugar: number;
  };
}

export { IIngredient, Recipe };
