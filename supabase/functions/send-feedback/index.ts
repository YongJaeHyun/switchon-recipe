/// <reference lib="deno.ns" />

// 앱 리뷰 묻기에서 [아쉬워요]로 쓴 의견을 받는다 (운영자 결정 2026-11-01).
// - 유저 JWT 필수 (uid는 토큰에서만). 내용 검사·다듬기는 _shared/feedback.ts
// - app_feedback 표에 한 줄 (service role). 한 사람당 KST 하루 한 번 → 429
// - 운영자 Slack(SLACK_WEBHOOK_URL, 장애 알림과 같은 웹훅)으로 알린다. uid·이메일은 보내지 않는다.
//   Slack 전송이 실패해도 의견은 저장됐으므로 성공으로 돌려준다

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import {
  buildFeedbackSlackText,
  FEEDBACK_RATE_LIMIT_MESSAGE,
  isFeedbackRateLimited,
  kstDayOf,
  parseFeedbackRequest,
} from '../_shared/feedback.ts';
import { createSlackPoster } from '../_shared/providerAlert.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const postSlack = createSlackPoster(Deno.env.get('SLACK_WEBHOOK_URL'));

const rateLimited = () =>
  json({ error: 'rate_limited', message: FEEDBACK_RATE_LIMIT_MESSAGE }, 429);

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const uid = await getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    const parsed = parseFeedbackRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const feedback = parsed.value;

    const now = new Date();
    const { data: last, error: lastError } = await supabase
      .from('app_feedback')
      .select('created_at')
      .eq('uid', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    if (isFeedbackRateLimited(last?.created_at ?? null, now)) return rateLimited();

    const { error: insertError } = await supabase.from('app_feedback').insert({
      uid,
      message: feedback.message,
      app_version: feedback.appVersion,
      week: feedback.week,
      has_pass: feedback.hasPass,
      trigger: feedback.trigger,
      kst_day: kstDayOf(now),
    });
    // 같은 날 동시에 두 번 온 요청: (uid, kst_day) 유일 제약
    if (insertError?.code === '23505') return rateLimited();
    if (insertError) throw insertError;

    try {
      await postSlack(buildFeedbackSlackText(feedback));
    } catch (error) {
      console.error('[send-feedback] Slack 전송 실패:', error);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    console.error('[send-feedback]', error);
    return json({ error: 'server_error' }, 500);
  }
});
