import { buildIssue, isProductionEvent, type SentryEvent } from '../_shared/sentry.ts';

export const DEFAULT_GITHUB_REPO = 'YongJaeHyun/switchon-recipe';
export const ISSUE_LABELS = ['sentry'];

export interface GithubIssueInput {
  title: string;
  body: string;
  labels: string[];
}

// sentry_github_link 테이블 (Sentry 이슈당 GitHub 이슈 1개)
export interface SentryLinkStore {
  // 새 행이면 true, 이미 있으면 false (insert ... on conflict do nothing)
  claim: (sentryIssueId: string) => Promise<boolean>;
  setIssueNumber: (sentryIssueId: string, issueNumber: number) => Promise<void>;
  // GitHub 이슈 생성 실패 시 행 삭제 → 다음 알림에서 재시도 가능
  release: (sentryIssueId: string) => Promise<void>;
}

export interface SentryWebhookDeps {
  verify: (body: string, signature: string | null) => Promise<boolean>;
  linkStore: SentryLinkStore;
  createGithubIssue: (repo: string, issue: GithubIssueInput) => Promise<{ number: number }>;
  env: { GITHUB_REPO?: string };
}

export interface SentryWebhookRequest {
  body: string;
  signature: string | null;
  resource: string | null;
}

export interface SentryWebhookResponse {
  status: number;
  body: { ok: boolean; created: boolean; issueNumber?: number; error?: string };
}

const skipped = (): SentryWebhookResponse => ({ status: 200, body: { ok: true, created: false } });

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};

const extractEvent = (payload: unknown): SentryEvent | null => {
  const event = (payload as { data?: { event?: unknown } } | null)?.data?.event;
  return event && typeof event === 'object' ? (event as SentryEvent) : null;
};

const issueIdOf = (event: SentryEvent): string | null => {
  const id = event.issue_id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim() !== '') return id.trim();
  return null;
};

// Sentry Internal Integration 웹훅 → GitHub 이슈
export const handleSentryWebhook = async (
  deps: SentryWebhookDeps,
  request: SentryWebhookRequest
): Promise<SentryWebhookResponse> => {
  if (!(await deps.verify(request.body, request.signature))) {
    return { status: 401, body: { ok: false, created: false, error: 'invalid signature' } };
  }

  // installation, issue 등 alert-rule 액션이 아닌 리소스는 무시
  if (request.resource !== 'event_alert') return skipped();

  const payload = parseJson(request.body);
  if (payload === undefined) {
    return { status: 400, body: { ok: false, created: false, error: 'invalid json' } };
  }

  const event = extractEvent(payload);
  if (!event || !isProductionEvent(event)) return skipped();

  const issueId = issueIdOf(event);
  if (!issueId) {
    console.warn('event_alert에 issue_id 없음, 건너뜀');
    return skipped();
  }

  if (!(await deps.linkStore.claim(issueId))) return skipped();

  let issueNumber: number;
  try {
    const { title, body } = buildIssue(event);
    ({ number: issueNumber } = await deps.createGithubIssue(
      deps.env.GITHUB_REPO || DEFAULT_GITHUB_REPO,
      { title, body, labels: ISSUE_LABELS }
    ));
  } catch (error) {
    console.error(`GitHub 이슈 생성 실패 (Sentry 이슈 ${issueId})`, error);
    try {
      await deps.linkStore.release(issueId);
    } catch (releaseError) {
      console.error(`중복 방지 행 삭제 실패 (Sentry 이슈 ${issueId})`, releaseError);
    }
    return {
      status: 500,
      body: { ok: false, created: false, error: 'github issue creation failed' },
    };
  }

  // 이슈는 이미 생성됨. 번호 기록 실패는 로그만 남기고 행은 유지 (중복 생성 방지)
  try {
    await deps.linkStore.setIssueNumber(issueId, issueNumber);
  } catch (error) {
    console.error(`GitHub 이슈 번호 저장 실패 (Sentry 이슈 ${issueId})`, error);
  }

  return { status: 200, body: { ok: true, created: true, issueNumber } };
};
