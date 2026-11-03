/// <reference lib="deno.ns" />

// 레시피 생성 처리 본체: create-recipe-by-gemini(실서비스), create-recipe-by-gemini-test가 공유한다.
// 생성·이미지·저장(generateAndSaveRecipe)은 create-recipe-by-name도 같이 쓴다.
// 흐름: 유저 인증(auth.getUser) -> 하루 한도 차감(consume_recipe_quota) -> 생성(텍스트/이미지/업로드/DB 저장)
// -> 생성 실패 시 한도 복구(release_recipe_quota). 한도 초과면 생성 없이 429를 돌려준다.
// HTTP·한도 흐름은 createRecipeHandler.ts(Vitest 대상), 여기는 supabase·Gemini·이미지 연결만 둔다.

import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { aiUsageFetch, type AiUsageFeature } from './aiUsage.ts';
import { requireEnv } from './auth.ts';
import type { RegisteredIngredient } from './ingredientNormalize.ts';
import { fetchAllPages } from './pagination.ts';
import { handleCreateRecipeRequest } from './createRecipeHandler.ts';
import { createProviderAlertFetch } from './providerAlert.ts';
import { parseQuotaDecision } from './quota.ts';
import { loadIngredientTags } from './recipeIngredientTags.ts';
import { raisedWeekNote, recipeWeekFromTags } from './recipeWeekFromTags.ts';
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

// 요청마다 만드는 두 클라이언트.
// - userClient: service role 키 + 유저 JWT 헤더. auth.getUser·스토리지 업로드·recipe insert에 쓴다 (기존 그대로)
// - adminClient: 유저 헤더가 없는 service role 전용. consume/release 같은 service role 전용 rpc와 등록 재료 조회에 쓴다.
//   supabase-js는 global.headers.Authorization(유저 JWT)이 있으면 그걸 service role 키보다 우선해서 Bearer로
//   보내므로, userClient로 service role 전용 rpc를 부르면 PostgREST가 authenticated role로 처리해 항상 거부된다.
export function createRecipeClients(req: Request) {
  const userClient = createClient(
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
  const adminClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
  return { userClient, adminClient };
}

export type RecipeClients = ReturnType<typeof createRecipeClients>;

export interface GenerateRecipeInput {
  command: string;
  week: unknown;
  is_zero_carb: unknown;
  // create-recipe-by-name: 이름 판정이 정한 레시피 이름 (AI가 만든 이름 대신, 이미지 생성 전에 바꾼다)
  recipeName?: string;
  // create-recipe-by-name: 바꿔 만든 안내. 만든 사람만 보는 recipe_note에 저장하고 응답 행에만 adapt_note로 붙인다
  adaptNote?: string | null;
  // 요청한 유저. Gemini 사용량 기록(ai_usage)에 붙인다
  uid?: string | null;
  // create-recipe-by-name: 저장 주차를 실제 재료(태그) 중 가장 높은 주차로 정한다 (_shared/recipeWeekFromTags.ts).
  // 고른 주차보다 올라가면 adapt_note에 이유를 한 줄 붙인다
  weekFromTags?: boolean;
  // 주차가 올라갔을 때 안내를 붙일지 (이름으로 만들기만. 재료로 만들기·추천에서 만들기는 조용히 주차만 맞춘다)
  weekNote?: boolean;
}

// 레시피 텍스트 생성 → 이미지 생성·업로드 → recipe 저장. 저장된 행을 돌려준다.
// create-recipe-by-gemini(-test)와 create-recipe-by-name이 같이 쓴다
export async function generateAndSaveRecipe(
  { userClient: supabaseClient, adminClient }: RecipeClients,
  providerFetch: typeof fetch,
  {
    command,
    week,
    is_zero_carb,
    recipeName,
    adaptNote,
    uid,
    weekFromTags,
    weekNote = true,
  }: GenerateRecipeInput
): Promise<unknown> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey) throw new Error('GEMINI_API_KEY not set');

  // 장애 알림 fetch에 기능 이름·uid를 붙여 Gemini 사용량도 남긴다 (_shared/aiUsage.ts, 실패해도 생성은 그대로)
  const usageFetch = (feature: AiUsageFeature) =>
    aiUsageFetch(providerFetch, adminClient, { feature, uid });

  // 🔹 1. 텍스트 기반 레시피 생성
  const recipeJson = await requestRecipeText(command, geminiKey, usageFetch('recipe_text'));
  const validated = validateRecipe(recipeJson);
  if (recipeName) validated.recipeName = recipeName;
  // 태그는 RecipeSchema 밖에서 따로 검증한다. 잘못된 태그가 레시피 생성을 막지 않도록 null로 저장한다.
  const tags = parseRecipeTags(recipeJson);

  // 🔹 2. 이미지 생성
  const imageBase64 = await requestRecipeImage(
    validated.recipeName,
    geminiKey,
    usageFetch('recipe_image')
  );

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
  // 재료 주차(week)도 같이 읽어 weekFromTags일 때 저장 주차를 정한다
  const weekByName = new Map<string, number>();
  const ingredientTags = await loadIngredientTags(
    () =>
      fetchAllPages(async (from, to) => {
        const { data, error } = await adminClient
          .from('ingredient')
          .select('name, sub_keywords, week')
          .eq('is_active', true)
          .order('id')
          .range(from, to);
        if (error) throw error;
        const rows = (data ?? []) as (RegisteredIngredient & { week: number })[];
        for (const row of rows) weekByName.set(row.name, row.week);
        return rows;
      }),
    ingredientsJson
  );

  let saveWeek = week;
  let saveAdaptNote = adaptNote ?? null;
  if (weekFromTags && typeof week === 'number') {
    const result = recipeWeekFromTags(ingredientTags, weekByName, week);
    saveWeek = result.week;
    const note = weekNote ? raisedWeekNote(result) : null;
    if (note) saveAdaptNote = saveAdaptNote ? `${saveAdaptNote}\n${note}` : note;
  }

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
      week: saveWeek,
      spicy: tags?.spicy ?? null,
      cuisine: tags?.cuisine ?? null,
      method: tags?.method ?? null,
      servings: validated.servings,
    })
    .select()
    .single();

  if (error) throw new Error(`DB 저장 실패: ${error.message}`);

  // 안내는 만든 사람만 보는 recipe_note에 둔다 (누구나 읽는 recipe 행에는 넣지 않는다).
  // 실패해도 레시피는 이미 저장됐으므로 안내만 빠진다. 방금 만든 사람에게는 응답으로 바로 보여 준다
  if (saveAdaptNote) {
    const recipeId = (data as { id?: number } | null)?.id;
    const ownerUid = uid ?? (data as { uid?: string } | null)?.uid ?? null;
    if (recipeId && ownerUid) {
      const { error: noteError } = await adminClient
        .from('recipe_note')
        .insert({ recipe_id: recipeId, uid: ownerUid, note: saveAdaptNote });
      if (noteError) console.error('레시피 안내 저장 실패:', noteError);
    }
    return { ...(data as Record<string, unknown>), adapt_note: saveAdaptNote };
  }

  return data;
}

async function handleCreateRecipe(req: Request, providerFetch: typeof fetch): Promise<Response> {
  const clients = createRecipeClients(req);
  const { userClient: supabaseClient, adminClient } = clients;

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

    generate: ({ command, week, is_zero_carb }, uid) =>
      // 저장 주차는 실제 재료 중 가장 높은 주차로 맞춘다 (앱이 보낸 주차보다 정확, 옛 앱에도 적용). 안내는 붙이지 않는다
      generateAndSaveRecipe(clients, providerFetch, {
        command,
        week,
        is_zero_carb,
        uid,
        weekFromTags: true,
        weekNote: false,
      }),
  });
}
