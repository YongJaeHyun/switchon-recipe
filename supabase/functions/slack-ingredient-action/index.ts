/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleSlackAction } from './handler.ts';

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Slack Interactivity 요청 주소. Slack은 Supabase JWT를 보내지 않으므로 verify_jwt = false,
// 대신 Slack 서명(SLACK_SIGNING_SECRET)으로 검증한다
serve(async (req: Request) => {
  try {
    const body = await req.text();

    const { status } = await handleSlackAction(
      {
        signingSecret: requireEnv('SLACK_SIGNING_SECRET'),
        nowSec: () => Math.floor(Date.now() / 1000),
        setIngredientActive: async (id, active) => {
          const { data, error } = await supabase
            .from('ingredient')
            .update({ is_active: active })
            .eq('id', id)
            .select('name')
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        respond: async (responseUrl, payload) => {
          const res = await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) console.error(`Slack 응답 실패 (${res.status})`);
        },
      },
      {
        body,
        timestamp: req.headers.get('X-Slack-Request-Timestamp'),
        signature: req.headers.get('X-Slack-Signature'),
      }
    );

    return new Response(null, { status });
  } catch (error) {
    console.error(error);
    return new Response(null, { status: 500 });
  }
});
