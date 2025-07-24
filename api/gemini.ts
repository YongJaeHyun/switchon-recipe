import { useRecipeStore } from 'stores/recipeStore';
import { RecipeDB } from 'types/database';
import { GeminiResponse } from 'types/gemini';
import { Recipe } from 'types/recipe';
import gemini from '../lib/axiosInstance';
import { insertRecipeToDB, uploadImageToDB } from './supabaseAPI';

export const createRecipe = async (message: string): Promise<RecipeDB> => {
  const fetchRecentRecipes = useRecipeStore.getState().fetchRecentRecipes;

  const res = await gemini.post<GeminiResponse>('/models/gemini-2.5-flash:generateContent', {
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          recipeName: { type: 'STRING' },
          cookingTime: { type: 'NUMBER' },
          nutrition: {
            type: 'OBJECT',
            properties: {
              carbohydrates: { type: 'NUMBER' },
              protein: { type: 'NUMBER' },
              fat: { type: 'NUMBER' },
              fiber: { type: 'NUMBER' },
              sugar: { type: 'NUMBER' },
            },
          },
          ingredients: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          cookingSteps: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
        },
      },
    },
    system_instruction: {
      parts: [
        {
          text: '너는 요리 레시피를 생성하는 데 특화된 AI 어시스턴트야. 사용자가 요리 레시피를 요청하면, 그에 맞는 레시피를 생성해줘. 응답은 항상 한국어로 해야해.',
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            text: message,
          },
        ],
      },
    ],
  });

  const recipe: Recipe = JSON.parse(res.data.candidates[0].content.parts[0].text);

  const generatedImageUri = await createRecipeImage(
    `name: ${recipe.recipeName}\ningredients: ${recipe.ingredients}`
  );
  recipe.imageUri = generatedImageUri;

  const recipeFromDB = await insertRecipeToDB(recipe);
  await fetchRecentRecipes();

  return recipeFromDB;
};

export const createRecipeImage = async (message: string) => {
  const res = await gemini.post(
    '/models/gemini-2.0-flash-preview-image-generation:generateContent',
    {
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
      contents: [
        {
          parts: [
            {
              text: `Generate images for the following foods. The food names and ingredients are as follows: \n${message}`,
            },
          ],
        },
      ],
    }
  );

  const imagePart = res.data.candidates[0].content.parts.find(
    (part) => 'inlineData' in part
  )?.inlineData;
  const base64Image = imagePart?.data;
  const mimeType = imagePart?.mimeType;
  const imageUri = await uploadImageToDB(mimeType, base64Image);
  return imageUri;
};
