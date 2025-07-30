import * as Sentry from '@sentry/react-native';
import { CanceledError } from 'axios';
import { RecipeDB } from 'types/database';
import { GeminiResponse } from 'types/gemini';
import { RecipeSchema } from 'types/recipe';
import { showErrorToast } from 'utils/showToast';
import gemini from '../lib/axiosInstance';
import { insertRecipeToDB, uploadImageToDB } from './supabaseAPI';

interface CreateRecipeProps {
  command: string;
  week: number;
  signal?: AbortSignal;
}

export const createRecipe = async ({
  command,
  week,
  signal,
}: CreateRecipeProps): Promise<RecipeDB> => {
  try {
    const res = await gemini.post<GeminiResponse>(
      '/models/gemini-2.5-flash:generateContent',
      {
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
                text: command,
              },
            ],
          },
        ],
      },
      {
        signal,
      }
    );

    const recipe = JSON.parse(res.data.candidates[0].content.parts[0].text);
    const validatedRecipe = validateRecipe(recipe);
    validatedRecipe.imageUri = await createRecipeImage(
      `name: ${validatedRecipe.recipeName}\ningredients: ${validatedRecipe.ingredients}`
    );

    const recipeFromDB = await insertRecipeToDB(validatedRecipe, week);
    return recipeFromDB;
  } catch (error) {
    if (error instanceof CanceledError) {
      showErrorToast({
        text1: '레시피 생성 취소',
        text2: `레시피 생성이 취소되었습니다.`,
        error,
      });
    } else {
      Sentry.captureException(error, { level: 'warning' });
      showErrorToast({
        text1: '일시적인 에러 발생',
        text2: `레시피 생성에 실패했습니다, 다시 한번 시도해주세요.`,
        error,
      });
    }
  }
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
              text: `Generate images for the following foods. However, it should never contain text. The food names and ingredients are as follows: \n${message}`,
            },
          ],
        },
      ],
    }
  );

  const imagePart = res.data.candidates[0].content.parts.find(
    (part) => 'inlineData' in part
  )?.inlineData;

  if (!imagePart) throw new Error('레시피 이미지 생성에 실패했습니다.');

  const base64Image = imagePart.data;
  const mimeType = imagePart.mimeType;
  const imageUri = await uploadImageToDB(mimeType, base64Image);
  return imageUri;
};

const validateRecipe = (recipe: unknown) => {
  const result = RecipeSchema.safeParse(recipe);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
};
