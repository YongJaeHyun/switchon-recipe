/// <reference lib="deno.ns" />

// 기존 레시피 태깅(백필) 엣지 함수: service role 호출로만 실행한다 (확인은 handler).
// 실제 의존성(Supabase, Gemini)을 연결해 handleTagRecipes를 서비스한다.
// 호출: 본문 없이 → 처음부터, { afterId: <이전 응답 lastId> } → 이어서. lastId가 더 늘지 않으면 한 바퀴 끝.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { createProviderAlertFetch } from '../_shared/providerAlert.ts';
import { RECIPE_TAG_BATCH_RESPONSE_SCHEMA } from '../_shared/recipeTags.ts';
import { handleTagRecipes, type TagRecipesDeps, type TagSourceRow } from './handler.ts';

const GEMINI_TIMEOUT_MS = 30_000;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Gemini가 결제·키·장애로 실패하면 운영자 Slack 알림 (_shared/providerAlert.ts). 응답·오류 처리는 그대로다
const providerFetch = createProviderAlertFetch({
  functionName: 'tag-recipes',
  client: supabase,
  webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
});

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const deps: TagRecipesDeps = {
  async fetchUntagged(afterId, limit) {
    let query = supabase
      .from('recipe')
      .select('id, recipe_name, ingredients, cooking_steps')
      .is('spicy', null);
    if (afterId !== null) query = query.gt('id', afterId);
    const { data, error } = await query.order('id', { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []) as TagSourceRow[];
  },

  async askGemini(prompt) {
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
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: RECIPE_TAG_BATCH_RESPONSE_SCHEMA,
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
      return (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : ''))
        .join('');
    } catch (error) {
      throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
  },

  async updateTags(id, tags) {
    const { error } = await supabase.from('recipe').update(tags).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async countRemaining() {
    const { count, error } = await supabase
      .from('recipe')
      .select('id', { count: 'exact', head: true })
      .is('spicy', null);
    if (error) throw error;
    return count ?? 0;
  },
};

serve((req: Request) => handleTagRecipes(req, deps));
