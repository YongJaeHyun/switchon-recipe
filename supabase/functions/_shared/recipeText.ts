// 레시피 본문(텍스트) 생성 요청. create-recipe-by-gemini(-test)의 레시피 생성(createRecipe.ts)이 쓴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다 (fetchFn을 받아 테스트에서 바꿔 끼운다).

import { RECIPE_SERVINGS_PROMPT, RECIPE_SERVINGS_RESPONSE_PROPERTY } from './recipeServings.ts';
import {
  RECIPE_TAG_REQUIRED,
  RECIPE_TAG_RESPONSE_PROPERTIES,
  RECIPE_TAG_SCHEMA_PROMPT,
} from './recipeTags.ts';

// 조리 순서 문장 형식 (운영자 2026-11-04). 앱이 문장별 줄·양/불 세기/시간 강조·괄호 팁 상자로 보여 주므로
// 그 처리에 맞는 짧은 문장으로 받는다. 형식은 그대로 문자열 배열(옛 앱 호환), 기존 레시피는 바꾸지 않는다
export const COOKING_STEPS_PROMPT =
  'cookingSteps(조리 순서)는 요리하면서 한 단계씩 따라 하기 좋게 쓰세요. ' +
  '단계는 모두 6~8단계로 하세요 (아주 간단한 요리는 더 적어도 돼요, 8단계를 넘기지 마세요). 손질처럼 이어지는 동작은 한 단계에 묶으세요. ' +
  '각 단계는 짧은 문장 1~3개로, 한 문장에는 동작 하나만 쓰세요. ' +
  '양·불 세기·시간은 숫자로 분명히 쓰세요 (예: 물 200ml, 간장 1큰술, 중불, 약불, 5분, 30초). ' +
  '주의사항이나 팁은 단계 끝에 괄호 하나로만 붙이세요 (예: "(타지 않게 저어 주세요)"). ' +
  '문장은 "~합니다" 대신 "~해요" 말투로 쓰세요. ' +
  // 앱 요리 모드가 단계 문장에서 재료 이름을 찾아 "이 단계 재료"로 보여 준다 (utils/stepIngredients.ts)
  '조리 순서에서 재료를 말할 때는 ingredients의 name과 똑같이 쓰세요. "버섯", "채소", "고기", "양념", "재료들"처럼 묶어 부르거나 줄여 쓰지 마세요 ' +
  '(예: name이 "표고버섯"이면 "표고버섯을 썰어요", name이 "연어 필레"면 "연어 필레를 구워요"). ' +
  'ingredients의 name에 "또는"이 있으면 조리 순서에는 그중 앞의 이름을 쓰세요. ' +
  '예: "냄비에 물 200ml를 붓고 중불에서 끓여요. 끓어오르면 두부를 넣고 5분 더 끓여요. (넘치지 않게 불을 조절해요)"';

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
                description:
                  '조리 순서. 단계마다 짧은 문장 1~3개, 문장마다 동작 하나, "~해요" 말투',
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
                RECIPE_SERVINGS_PROMPT +
                ' ' +
                COOKING_STEPS_PROMPT,
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
