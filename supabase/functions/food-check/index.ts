/// <reference lib="deno.ns" />

// 편의점 판정 엣지 함수: 실제 의존성(Supabase, Gemini, imagescript)을 연결해 handleFoodCheck를 서비스한다.
// 한도 rpc·패스 확인·food_check 기록·이미지 업로드는 모두 유저 헤더가 없는 service role 클라이언트로
// 한다 (유저 JWT를 실은 클라이언트로 rpc를 부르면 authenticated role로 처리되어 거부되므로).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import type { FoodCheckInput } from '../_shared/foodCheck.ts';
import { parsePremiumQuota } from '../_shared/premiumQuota.ts';
import { type FoodCheckDeps, type FoodCheckRow, handleFoodCheck } from './handler.ts';
import { type ImageCodec, prepareFoodCheckImages } from './images.ts';

const FEATURE = 'food_check';
const BUCKET = 'food-check';
const GEMINI_TIMEOUT_MS = 30_000;
const SIGNED_URL_SECONDS = 60 * 60;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const askGemini = async (prompt: string, input: FoodCheckInput): Promise<string> => {
  const geminiKey = requireEnv('GEMINI_API_KEY');
  const parts =
    input.type === 'text'
      ? [{ text: prompt }]
      : [{ inlineData: { mimeType: input.mimeType, data: input.imageBase64 } }, { text: prompt }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          // 생각(thinking)을 끄고 바로 답하게 해 30초 시간 제한 안에서 지연을 줄인다
          generationConfig: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini 호출 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
    if (!text)
      throw new Error(`Gemini 응답에 텍스트가 없습니다: ${JSON.stringify(data).slice(0, 300)}`);
    return text;
  } catch (error) {
    throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
  } finally {
    clearTimeout(timer);
  }
};

// imagescript 연결. GIF 등 Image가 아닌 결과는 디코드 실패로 던진다
const codec: ImageCodec = {
  async decode(bytes) {
    const image = await Image.decode(bytes);
    if (!(image instanceof Image)) throw new Error('판정 이미지를 디코드할 수 없습니다');
    return image;
  },
  RESIZE_AUTO: Image.RESIZE_AUTO,
};

const upload = async (path: string, bytes: Uint8Array) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`판정 이미지 업로드 실패(${path}): ${error.message}`);
};

const deps: FoodCheckDeps = {
  getUid,
  premiumClient: supabase,
  now: () => new Date(),

  async consume(uid) {
    const { data, error } = await supabase.rpc('consume_premium_quota', {
      p_uid: uid,
      p_feature: FEATURE,
    });
    if (error) throw new Error(`판정 한도 확인 실패: ${error.message}`);
    return parsePremiumQuota(data);
  },

  async release(uid) {
    const { error } = await supabase.rpc('release_premium_quota', {
      p_uid: uid,
      p_feature: FEATURE,
    });
    if (error) throw new Error(`판정 한도 복구 실패: ${error.message}`);
  },

  async getStartDate(uid) {
    const { data, error } = await supabase
      .from('user')
      .select('start_date')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return data?.start_date ?? null;
  },

  askGemini,

  async insertCheck(row) {
    const { data, error } = await supabase.from('food_check').insert(row).select('*').single();
    if (error) throw new Error(`판정 기록 저장 실패: ${error.message}`);
    return data as FoodCheckRow;
  },

  // 디코드 실패(JPEG/PNG 아님 등)는 던진다 → Gemini 호출 전 차감 되돌림 후 500
  prepareImages: (image) => prepareFoodCheckImages(codec, image),

  async storeImages(uid, id, { original, thumb }) {
    const imagePath = `${uid}/${id}.jpg`;
    const thumbPath = `${uid}/${id}_thumb.jpg`;
    await upload(imagePath, original);
    try {
      await upload(thumbPath, thumb);
    } catch (error) {
      // 원본만 남지 않게 지운다 (최선 노력)
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([imagePath]);
      if (removeError) console.error('판정 원본 이미지 삭제 실패:', removeError);
      throw error;
    }
    return { imagePath, thumbPath };
  },

  async updateImagePaths(id, { imagePath, thumbPath }) {
    const { error } = await supabase
      .from('food_check')
      .update({ image_path: imagePath, thumb_path: thumbPath })
      .eq('id', id);
    if (error) throw new Error(`판정 이미지 경로 기록 실패: ${error.message}`);
  },

  async deleteCheck(id) {
    const { error } = await supabase.from('food_check').delete().eq('id', id);
    if (error) throw error;
  },

  async signThumbUrl(path) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error) throw error;
    return data?.signedUrl ?? null;
  },
};

serve((req: Request) => handleFoodCheck(req, deps));
