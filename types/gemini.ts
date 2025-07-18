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
  cookingTime: string;
  ingredients: string[];
  nutrition: {
    carbohydrates: string;
    protein: string;
    fat: string;
    fiber: string;
    sugar: string;
  };
}
