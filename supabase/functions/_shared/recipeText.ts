// 레시피 본문(텍스트) 생성 요청. create-recipe-by-gemini(-test)의 레시피 생성(createRecipe.ts)이 쓴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다 (fetchFn을 받아 테스트에서 바꿔 끼운다).

import { RECIPE_SERVINGS_PROMPT, RECIPE_SERVINGS_RESPONSE_PROPERTY } from './recipeServings.ts';
import {
  RECIPE_TAG_REQUIRED,
  RECIPE_TAG_RESPONSE_PROPERTIES,
  RECIPE_TAG_SCHEMA_PROMPT,
} from './recipeTags.ts';

// 성공하면 Gemini가 만든 레시피 JSON(검증 전)을 돌려준다. 검증은 호출부(createRecipe.ts의 zod 스키마)가 한다
export async function requestRecipeText(
  command: string,
  geminiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<unknown> {
  const recipeRes = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              recipeName: {
                type: 'STRING',
              },
              cookingTime: {
                type: 'NUMBER',
              },
              nutrition: {
                type: 'OBJECT',
                properties: {
                  carbohydrates: {
                    type: 'NUMBER',
                  },
                  protein: {
                    type: 'NUMBER',
                  },
                  fat: {
                    type: 'NUMBER',
                  },
                  fiber: {
                    type: 'NUMBER',
                  },
                  sugar: {
                    type: 'NUMBER',
                  },
                },
              },
              ingredients: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: {
                      type: 'STRING',
                    },
                    isOptional: {
                      type: 'BOOLEAN',
                    },
                    amount: {
                      type: 'STRING',
                    },
                  },
                },
              },
              cookingSteps: {
                type: 'ARRAY',
                items: {
                  type: 'STRING',
                },
              },
              ...RECIPE_TAG_RESPONSE_PROPERTIES,
              ...RECIPE_SERVINGS_RESPONSE_PROPERTY,
            },
            // 다른 필드는 지금까지처럼 required 없이 둔다 (동작 유지). 태그와 기준 인분만 required로 요청한다.
            // 그래도 태그는 RecipeSchema(zod) 밖에서 parseRecipeTags로, 인분은 parseServings로 해석하므로
            // 빠지거나 잘못돼도 생성은 실패하지 않고 null로 저장된다
            required: [...RECIPE_TAG_REQUIRED, 'servings'],
          },
        },
        system_instruction: {
          parts: [
            {
              text:
                'You are an AI assistant specialized in generating cooking recipes for the Switch-On Diet. When a user requests a recipe, you should create a suitable recipe. Ingredient quantities should be as specific as possible. All responses must always be in Korean. ' +
                RECIPE_TAG_SCHEMA_PROMPT +
                ' ' +
                RECIPE_SERVINGS_PROMPT,
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
      }),
    }
  );

  if (!recipeRes.ok) {
    throw new Error(`Gemini 텍스트 요청 실패 (${recipeRes.status})`);
  }

  const parsed = await recipeRes.json();
  const contentText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!contentText) throw new Error('Gemini 응답에 텍스트가 없습니다');

  return JSON.parse(contentText);
}
