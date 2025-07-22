export interface GeminiResponse {
  candidates: Candidates[];
}

interface Candidates {
  content: Parts;
  finishReason: string;
  index: number;
}

interface Parts {
  parts: Part[];
}
interface Part {
  text: string;
}

export interface Recipe {
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
