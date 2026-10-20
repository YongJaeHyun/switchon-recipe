/// <reference lib="deno.ns" />

// 기존 레시피 태깅(백필): service role 호출로만 실행한다. spicy가 null인 레시피를 오래된 순으로
// 한 번에 최대 50개 가져와 10개씩 Gemini에 보내 맛·종류·방식 태그를 받고, 검증을 통과한 것만 update한다.
// 응답 { tagged, failed, remaining }. remaining이 0이 될 때까지 여러 번 호출한다 (멱등).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import {
  buildRecipeTagBatchPrompt,
  parseRecipeTagBatchResponse,
  recipeTagInputOf,
} from '../_shared/recipeTags.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';

const MAX_ROWS = 50;
const BATCH_SIZE = 10;
const GEMINI_TIMEOUT_MS = 30_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const askGemini = async (prompt: string): Promise<string> => {
  const geminiKey = requireEnv('GEMINI_API_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
    return (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : ''))
      .join('');
  } catch (error) {
    throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
  } finally {
    clearTimeout(timer);
  }
};

const countRemaining = async (): Promise<number> => {
  const { count, error } = await supabase
    .from('recipe')
    .select('id', { count: 'exact', head: true })
    .is('spicy', null);
  if (error) throw error;
  return count ?? 0;
};

serve(async (req: Request) => {
  try {
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }

    const { data, error } = await supabase
      .from('recipe')
      .select('id, recipe_name, ingredients, cooking_steps')
      .is('spicy', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(MAX_ROWS);
    if (error) throw error;
    const rows = data ?? [];

    let tagged = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map(recipeTagInputOf);
      const ids = batch.map((r) => r.id);

      let results;
      try {
        results = parseRecipeTagBatchResponse(
          await askGemini(buildRecipeTagBatchPrompt(batch)),
          ids
        );
      } catch (error) {
        console.error(`태깅 Gemini 실패 (${ids.join(',')}):`, error);
        failed += batch.length;
        continue;
      }
      failed += batch.length - results.length;

      for (const { id, tags } of results) {
        const { error: updateError } = await supabase.from('recipe').update(tags).eq('id', id);
        if (updateError) {
          console.error(`태그 저장 실패 (${id}):`, updateError.message);
          failed += 1;
        } else {
          tagged += 1;
        }
      }
    }

    return json({ tagged, failed, remaining: await countRemaining() }, 200);
  } catch (error) {
    console.error('레시피 태깅 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
});
