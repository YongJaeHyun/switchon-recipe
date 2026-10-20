/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { exceedsBodyLimit, makeSignatureVerifier, MAX_BODY_BYTES } from '../_shared/sentry.ts';
import { handleSentryWebhook } from './handler.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const GITHUB_TIMEOUT_MS = 15_000;

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

// 사용자 Authorization 헤더 없이 service role로만 접근 (sentry_github_link는 RLS 정책 없음)
const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const LINK_TABLE = 'sentry_github_link';

const verify = makeSignatureVerifier(
  () => Deno.env.get('SENTRY_CLIENT_SECRET'),
  (message) => console.error(message)
);

const tooLarge = () =>
  new Response(JSON.stringify({ ok: false, accepted: false, error: 'payload too large' }), {
    status: 413,
    headers: { 'Content-Type': 'application/json' },
  });

// Sentry Internal Integration 웹훅 주소. Sentry는 Supabase JWT를 보내지 않으므로 verify_jwt = false,
// 대신 Sentry-Hook-Signature(SENTRY_CLIENT_SECRET)로 검증한다.
// Sentry는 약 1초 안에 응답을 받아야 하므로 GitHub 호출과 DB 작업은 EdgeRuntime.waitUntil로 응답 후에 처리
serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    // 1MB 초과는 본문을 읽기 전에 거부
    if (exceedsBodyLimit(req.headers.get('content-length'))) return tooLarge();

    // 서명은 원문 바이트 기준이므로 파싱 전에 text로 읽는다
    const body = await req.text();
    // content-length 없이(chunked) 온 경우 대비
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return tooLarge();

    const result = await handleSentryWebhook(
      {
        verify,
        linkStore: {
          claim: async (sentryIssueId, payload) => {
            // insert ... on conflict do nothing: 새로 들어간 행만 돌려받는다
            const { data, error } = await supabase
              .from(LINK_TABLE)
              .upsert(
                {
                  sentry_issue_id: sentryIssueId,
                  payload,
                  attempts: 1,
                  attempted_at: new Date().toISOString(),
                },
                { onConflict: 'sentry_issue_id', ignoreDuplicates: true }
              )
              .select('sentry_issue_id');
            if (error) throw error;
            return (data ?? []).length > 0;
          },
          listPending: async (limit, maxAttempts, staleBefore) => {
            const { data, error } = await supabase
              .from(LINK_TABLE)
              .select('sentry_issue_id, attempts, payload')
              .is('github_issue_number', null)
              .lt('attempts', maxAttempts)
              .lt('attempted_at', new Date(staleBefore).toISOString())
              .order('created_at', { ascending: true })
              .limit(limit);
            if (error) throw error;
            return (data ?? []).map((row) => ({
              sentryIssueId: row.sentry_issue_id,
              attempts: row.attempts,
              payload: row.payload,
            }));
          },
          lease: async (sentryIssueId, seenAttempts) => {
            // attempts 값이 그대로일 때만 갱신 → 동시에 온 웹훅 중 하나만 재시도
            const { data, error } = await supabase
              .from(LINK_TABLE)
              .update({ attempts: seenAttempts + 1, attempted_at: new Date().toISOString() })
              .eq('sentry_issue_id', sentryIssueId)
              .eq('attempts', seenAttempts)
              .is('github_issue_number', null)
              .select('sentry_issue_id');
            if (error) throw error;
            return (data ?? []).length > 0;
          },
          markCreated: async (sentryIssueId, issueNumber) => {
            const { error } = await supabase
              .from(LINK_TABLE)
              .update({ github_issue_number: issueNumber, last_error: null })
              .eq('sentry_issue_id', sentryIssueId);
            if (error) throw error;
          },
          markFailed: async (sentryIssueId, message) => {
            const { error } = await supabase
              .from(LINK_TABLE)
              .update({ last_error: message })
              .eq('sentry_issue_id', sentryIssueId);
            if (error) throw error;
          },
        },
        createGithubIssue: async (repo, issue) => {
          const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${requireEnv('GITHUB_ISSUES_TOKEN')}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
              'User-Agent': 'switchon-sentry-to-github',
            },
            body: JSON.stringify(issue),
            signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
          });
          if (!res.ok) {
            throw new Error(`GitHub 이슈 생성 실패 (${res.status}): ${await res.text()}`);
          }
          const json = await res.json();
          return { number: json.number };
        },
        background: (promise) => EdgeRuntime.waitUntil(promise),
        now: () => Date.now(),
        env: { GITHUB_REPO: Deno.env.get('GITHUB_REPO') },
      },
      {
        body,
        signature: req.headers.get('Sentry-Hook-Signature'),
        resource: req.headers.get('Sentry-Hook-Resource'),
      }
    );

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, accepted: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
