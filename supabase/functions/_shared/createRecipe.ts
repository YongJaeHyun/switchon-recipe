/// <reference lib="deno.ns" />

// 레시피 생성 처리 본체: create-recipe-by-gemini(실서비스), create-recipe-by-gemini-test가 공유한다.
// 흐름: 유저 인증(auth.getUser) -> 하루 한도 차감(consume_recipe_quota) -> 생성(텍스트/이미지/업로드/DB 저장)
// -> 생성 실패 시 한도 복구(release_recipe_quota). 한도 초과면 생성 없이 429를 돌려준다.

import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from './auth.ts';
import { parseQuotaDecision, quotaExceededBody, runWithQuota } from './quota.ts';
import { requestRecipeImage } from './recipeImage.ts';

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
  ingredients: z.array(
    z.object({
      name: z.string(),
      isOptional: z.boolean(),
      amount: z.string(),
    })
  ),
  cookingSteps: z.array(z.string()),
  imageUri: z.string().nullish(),
});

type Recipe = z.infer<typeof RecipeSchema>;

const validateRecipe = (recipe: unknown) => {
  const result = RecipeSchema.safeParse(recipe);
  if (!result.success) {
    console.error('Recipe Validation Error:', result.error);
    throw new Error('레시피 형식이 유효하지 않습니다');
  }
  return result.data;
};

const jsonHeaders = { 'Content-Type': 'application/json' };

export async function handleCreateRecipe(req: Request): Promise<Response> {
  const supabaseClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') ?? '',
        },
      },
    }
  );

  // consume_recipe_quota/release_recipe_quota는 service role 전용으로 revoke되어 있다.
  // supabase-js는 global.headers.Authorization(위 유저 JWT)이 있으면 그걸 service role 키보다
  // 우선해서 Bearer로 보내므로, 위 supabaseClient로 이 두 rpc를 호출하면 PostgREST가 요청을
  // authenticated role로 처리해 항상 거부된다. 그래서 유저 헤더를 전혀 싣지 않는 별도의
  // service role 전용 클라이언트를 만들어 이 두 rpc에만 쓴다 (auth.getUser/insert/upload는
  // 기존 supabaseClient 그대로 사용).
  const adminClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  try {
    const { command, week, is_zero_carb } = await req.json();

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) throw new Error('로그인된 사용자 정보를 가져올 수 없습니다');

    const consume = async () => {
      const { data, error } = await adminClient.rpc('consume_recipe_quota', {
        p_uid: user.id,
      });
      if (error) throw new Error(`레시피 한도 확인 실패: ${error.message}`);
      return parseQuotaDecision(data);
    };

    const release = async (): Promise<void> => {
      const { error } = await adminClient.rpc('release_recipe_quota', { p_uid: user.id });
      if (error) throw new Error(`레시피 한도 복구 실패: ${error.message}`);
    };

    const generate = async () => {
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) throw new Error('GEMINI_API_KEY not set');

      // 🔹 1. 텍스트 기반 레시피 생성
      const recipeRes = await fetch(
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
                },
              },
            },
            system_instruction: {
              parts: [
                {
                  text: 'You are an AI assistant specialized in generating cooking recipes for the Switch-On Diet. When a user requests a recipe, you should create a suitable recipe. Ingredient quantities should be as specific as possible. All responses must always be in Korean.',
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

      const recipeJson = JSON.parse(contentText);
      const validated = validateRecipe(recipeJson);

      // 🔹 2. 이미지 생성
      const imageBase64 = await requestRecipeImage(validated.recipeName, geminiKey);

      // base64 → binary
      const pngBuffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

      // PNG decode
      const image = await Image.decode(pngBuffer);

      // JPEG encode (quality 80)
      const jpegBuffer = await image.encodeJPEG(80);

      const mimeType = 'image/jpeg';
      const fileExt = 'jpg';
      const fileName = `recipe-${Date.now()}.${fileExt}`;
      const bucket = 'recipe-images';

      // 🔹 3. 이미지 업로드
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(fileName, jpegBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw new Error(`이미지 업로드 실패: ${uploadError.message}`);

      // getPublicUrl()은 error를 반환하지 않는다 (supabase-js 타입에도 없음)
      const { data: imageUrlData } = supabaseClient.storage.from(bucket).getPublicUrl(fileName);

      validated.imageUri = imageUrlData.publicUrl;

      // 🔹 4. DB 저장
      const { data, error } = await supabaseClient
        .from('recipe')
        .insert({
          cooking_steps: JSON.stringify(validated.cookingSteps),
          ingredients: JSON.stringify(validated.ingredients),
          nutrition: JSON.stringify(validated.nutrition),
          cooking_time: validated.cookingTime,
          recipe_name: validated.recipeName,
          image_uri: validated.imageUri,
          is_zero_carb,
          week,
        })
        .select()
        .single();

      if (error) throw new Error(`DB 저장 실패: ${error.message}`);

      return data;
    };

    const result = await runWithQuota({ consume, release }, generate);

    if (result.status === 'exceeded') {
      return new Response(JSON.stringify(quotaExceededBody(result.decision)), {
        headers: jsonHeaders,
        status: 429,
      });
    }

    // 한도 차감은 이미 확정됐다. 이 응답을 클라이언트가 받지 못하고 중단해도(abort) 생성 자체는
    // 서버에서 끝났으므로 차감은 되돌리지 않는다 (의도된 동작).
    return new Response(JSON.stringify(result.value), {
      headers: jsonHeaders,
      status: 200,
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({
        error: String(err),
      }),
      {
        headers: jsonHeaders,
        status: 500,
      }
    );
  }
}
