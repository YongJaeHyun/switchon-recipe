/// <reference lib="deno.ns" />

// 레시피 생성 처리 본체: create-recipe-by-gemini(실서비스), create-recipe-by-gemini-test가 공유한다.
// 흐름: 유저 인증(auth.getUser) -> 하루 한도 차감(consume_recipe_quota) -> 생성(텍스트/이미지/업로드/DB 저장)
// -> 생성 실패 시 한도 복구(release_recipe_quota). 한도 초과면 생성 없이 429를 돌려준다.
// HTTP·한도 흐름은 createRecipeHandler.ts(Vitest 대상), 여기는 supabase·Gemini·이미지 연결만 둔다.

import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from './auth.ts';
import type { RegisteredIngredient } from './ingredientNormalize.ts';
import { fetchAllPages } from './pagination.ts';
import { handleCreateRecipeRequest } from './createRecipeHandler.ts';
import { createProviderAlertFetch } from './providerAlert.ts';
import { parseQuotaDecision } from './quota.ts';
import { loadIngredientTags } from './recipeIngredientTags.ts';
import { requestRecipeImage } from './recipeImage.ts';
import { parseServings } from './recipeServings.ts';
import { parseRecipeTags } from './recipeTags.ts';
import { requestRecipeText } from './recipeText.ts';

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
  // 기준 인분. 빠지거나 1~8 정수가 아니어도 생성을 실패시키지 않고 null로 저장한다
  servings: z.unknown().transform((v) => parseServings(v)),
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

// 함수 이름(create-recipe-by-gemini / -test)마다 한 번 만든다. Gemini 호출이 결제·키·장애로 실패하면
// 운영자 Slack 알림을 보낸다 (_shared/providerAlert.ts). 유저 응답은 그대로다
export function createRecipeHandler(functionName: string) {
  const providerFetch = createProviderAlertFetch({
    functionName,
    client: createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
    webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
  });
  return (req: Request) => handleCreateRecipe(req, providerFetch);
}

async function handleCreateRecipe(req: Request, providerFetch: typeof fetch): Promise<Response> {
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

  return handleCreateRecipeRequest(req, {
    getUserId: async () => {
      const {
        data: { user },
        error,
      } = await supabaseClient.auth.getUser();
      return error || !user ? null : user.id;
    },

    consume: async (uid) => {
      const { data, error } = await adminClient.rpc('consume_recipe_quota', { p_uid: uid });
      if (error) throw new Error(`레시피 한도 확인 실패: ${error.message}`);
      return parseQuotaDecision(data);
    },

    release: async (uid) => {
      const { error } = await adminClient.rpc('release_recipe_quota', { p_uid: uid });
      if (error) throw new Error(`레시피 한도 복구 실패: ${error.message}`);
    },

    generate: async ({ command, week, is_zero_carb }) => {
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) throw new Error('GEMINI_API_KEY not set');

      // 🔹 1. 텍스트 기반 레시피 생성
      const recipeJson = await requestRecipeText(command, geminiKey, providerFetch);
      const validated = validateRecipe(recipeJson);
      // 태그는 RecipeSchema 밖에서 따로 검증한다. 잘못된 태그가 레시피 생성을 막지 않도록 null로 저장한다.
      const tags = parseRecipeTags(recipeJson);

      // 🔹 2. 이미지 생성
      const imageBase64 = await requestRecipeImage(validated.recipeName, geminiKey, providerFetch);

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

      const ingredientsJson = JSON.stringify(validated.ingredients);
      // 검색용 재료 태그 (등록 재료 이름). 등록 재료를 못 읽어도 생성은 계속하고 빈 태그로 저장한다
      const ingredientTags = await loadIngredientTags(
        () =>
          fetchAllPages(async (from, to) => {
            const { data, error } = await adminClient
              .from('ingredient')
              .select('name, sub_keywords')
              .eq('is_active', true)
              .order('id')
              .range(from, to);
            if (error) throw error;
            return (data ?? []) as RegisteredIngredient[];
          }),
        ingredientsJson
      );

      // 🔹 4. DB 저장
      const { data, error } = await supabaseClient
        .from('recipe')
        .insert({
          cooking_steps: JSON.stringify(validated.cookingSteps),
          ingredients: ingredientsJson,
          ingredient_tags: ingredientTags,
          nutrition: JSON.stringify(validated.nutrition),
          cooking_time: validated.cookingTime,
          recipe_name: validated.recipeName,
          image_uri: validated.imageUri,
          is_zero_carb,
          week,
          spicy: tags?.spicy ?? null,
          cuisine: tags?.cuisine ?? null,
          method: tags?.method ?? null,
          servings: validated.servings,
        })
        .select()
        .single();

      if (error) throw new Error(`DB 저장 실패: ${error.message}`);

      return data;
    },
  });
}
