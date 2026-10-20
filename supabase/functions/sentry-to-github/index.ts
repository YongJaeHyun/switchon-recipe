/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySentrySignature } from '../_shared/sentry.ts';
import { handleSentryWebhook } from './handler.ts';

const GITHUB_TIMEOUT_MS = 15_000;

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

// 사용자 Authorization 헤더 없이 service role로만 접근 (sentry_github_link는 RLS 정책 없음)
const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const LINK_TABLE = 'sentry_github_link';

// Sentry Internal Integration 웹훅 주소. Sentry는 Supabase JWT를 보내지 않으므로 verify_jwt = false,
// 대신 Sentry-Hook-Signature(SENTRY_CLIENT_SECRET)로 검증한다
serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    // 서명은 원문 바이트 기준이므로 파싱 전에 text로 읽는다
    const body = await req.text();

    const result = await handleSentryWebhook(
      {
        verify: (raw, signature) =>
          verifySentrySignature(raw, signature, Deno.env.get('SENTRY_CLIENT_SECRET') ?? ''),
        linkStore: {
          claim: async (sentryIssueId) => {
            const { data, error } = await supabase
              .from(LINK_TABLE)
              .upsert(
                { sentry_issue_id: sentryIssueId },
                { onConflict: 'sentry_issue_id', ignoreDuplicates: true }
              )
              .select('sentry_issue_id');
            if (error) throw error;
            return (data ?? []).length > 0;
          },
          setIssueNumber: async (sentryIssueId, issueNumber) => {
            const { error } = await supabase
              .from(LINK_TABLE)
              .update({ github_issue_number: issueNumber })
              .eq('sentry_issue_id', sentryIssueId);
            if (error) throw error;
          },
          release: async (sentryIssueId) => {
            const { error } = await supabase
              .from(LINK_TABLE)
              .delete()
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
    return new Response(JSON.stringify({ ok: false, created: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
