/// <reference lib="deno.ns" />

// 인바디 결과지 읽기 엣지 함수(스위치온 패스 전용): 실제 의존성(Supabase, Gemini)을 연결해
// handleReadInbody를 서비스한다. 패스 확인(has_premium_access_for)도 service role 클라이언트로 한다.
// 한도(premium_usage, feature 'inbody_read')는 유저 헤더가 없는 service role 클라이언트로 읽고 쓴다
// (premium_usage는 RLS만 켜고 정책이 없어 service role만 접근). 사진·결과는 저장하지 않는다.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { createProviderAlertFetch } from '../_shared/providerAlert.ts';
import { handleReadInbody, type InbodyImage, type ReadInbodyDeps } from './handler.ts';
import { INBODY_RESPONSE_SCHEMA } from './result.ts';
import type { UsageStore } from './usage.ts';

const FEATURE = 'inbody_read';
const GEMINI_TIMEOUT_MS = 30_000;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Gemini가 결제·키·장애로 실패하면 운영자 Slack 알림 (_shared/providerAlert.ts). 응답·오류 처리는 그대로다
const providerFetch = createProviderAlertFetch({
  functionName: 'read-inbody',
  client: supabase,
  webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
});

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const askGemini = async (prompt: string, image: InbodyImage): Promise<string> => {
  const geminiKey = requireEnv('GEMINI_API_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: image.mimeType, data: image.imageBase64 } },
                { text: prompt },
              ],
            },
          ],
          // 숫자 읽기라 생각(thinking)을 끄고 응답 스키마로 모양을 고정한다
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: INBODY_RESPONSE_SCHEMA,
            temperature: 0,
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
      throw new Error(
        `Gemini 응답에 텍스트가 없습니다 (finishReason: ${data?.candidates?.[0]?.finishReason ?? '없음'})`
      );
    return text;
  } catch (error) {
    throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
  } finally {
    clearTimeout(timer);
  }
};

// premium_usage 오늘 행 하나 (uid, day, 'inbody_read')
const usageStore = (uid: string, day: string): UsageStore => {
  const row = () =>
    supabase
      .from('premium_usage')
      .select('used')
      .eq('uid', uid)
      .eq('day', day)
      .eq('feature', FEATURE);
  return {
    async ensure() {
      const { error } = await supabase
        .from('premium_usage')
        .upsert(
          { uid, day, feature: FEATURE, used: 0 },
          { onConflict: 'uid,day,feature', ignoreDuplicates: true }
        );
      if (error) throw new Error(`인바디 읽기 한도 행 만들기 실패: ${error.message}`);
    },
    async read() {
      const { data, error } = await row().maybeSingle();
      if (error) throw new Error(`인바디 읽기 한도 확인 실패: ${error.message}`);
      return typeof data?.used === 'number' ? data.used : null;
    },
    async swap(from, to) {
      const { data, error } = await supabase
        .from('premium_usage')
        .update({ used: to })
        .eq('uid', uid)
        .eq('day', day)
        .eq('feature', FEATURE)
        .eq('used', from)
        .select('used');
      if (error) throw new Error(`인바디 읽기 한도 갱신 실패: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },
  };
};

const deps: ReadInbodyDeps = {
  getUid,
  premiumClient: supabase,
  now: () => new Date(),
  usageStore,
  askGemini,
};

serve((req: Request) => handleReadInbody(req, deps));
