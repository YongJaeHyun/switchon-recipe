import { buildIssue, isProductionEvent, type SentryEvent } from '../_shared/sentry.ts';

export const DEFAULT_GITHUB_REPO = 'YongJaeHyun/switchon-recipe';
export const ISSUE_LABELS = ['sentry'];
// 실패한 행 재시도 상한 (최초 시도 포함)
export const MAX_ATTEMPTS = 5;
// 웹훅 1건당 재시도할 최대 행 수
export const RETRY_BATCH = 3;
// 시도 중인 행을 다른 요청이 재시도하지 않도록 하는 임대 시간. GitHub 타임아웃(15초)보다 충분히 길게
export const LEASE_MS = 2 * 60 * 1000;

export interface IssuePayload {
  title: string;
  body: string;
}

export interface GithubIssueInput extends IssuePayload {
  labels: string[];
}

export interface PendingLink {
  sentryIssueId: string;
  attempts: number;
  payload: IssuePayload | null;
}

// sentry_github_link 테이블 (Sentry 이슈당 GitHub 이슈 1개)
export interface SentryLinkStore {
  // insert (attempts = 1, attempted_at = now, payload) on conflict do nothing. 새 행이면 true
  claim: (sentryIssueId: string, payload: IssuePayload) => Promise<boolean>;
  // github_issue_number is null and attempts < maxAttempts and attempted_at < staleBefore, 오래된 순
  listPending: (limit: number, maxAttempts: number, staleBefore: number) => Promise<PendingLink[]>;
  // attempts = seen + 1, attempted_at = now where attempts = seen and github_issue_number is null.
  // 다른 요청이 먼저 가져갔으면 false
  lease: (sentryIssueId: string, seenAttempts: number) => Promise<boolean>;
  markCreated: (sentryIssueId: string, issueNumber: number) => Promise<void>;
  markFailed: (sentryIssueId: string, error: string) => Promise<void>;
}

export interface SentryWebhookDeps {
  verify: (body: string, signature: string | null) => Promise<boolean>;
  linkStore: SentryLinkStore;
  createGithubIssue: (repo: string, issue: GithubIssueInput) => Promise<{ number: number }>;
  // 응답 후에도 계속 실행할 작업 (EdgeRuntime.waitUntil)
  background: (promise: Promise<unknown>) => void;
  now: () => number;
  env: { GITHUB_REPO?: string };
}

export interface SentryWebhookRequest {
  body: string;
  signature: string | null;
  resource: string | null;
}

export interface SentryWebhookResponse {
  status: number;
  body: { ok: boolean; accepted: boolean; error?: string };
}

const ignored = (): SentryWebhookResponse => ({ status: 200, body: { ok: true, accepted: false } });

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

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

// GitHub 이슈 1건 생성 시도. 실패는 행에 기록하고 던지지 않는다
const attemptCreate = async (
  deps: SentryWebhookDeps,
  sentryIssueId: string,
  payload: IssuePayload
) => {
  let issueNumber: number;
  try {
    ({ number: issueNumber } = await deps.createGithubIssue(
      deps.env.GITHUB_REPO || DEFAULT_GITHUB_REPO,
      { ...payload, labels: ISSUE_LABELS }
    ));
  } catch (error) {
    console.error(`GitHub 이슈 생성 실패 (Sentry 이슈 ${sentryIssueId})`, error);
    await deps.linkStore.markFailed(sentryIssueId, errorMessage(error));
    return;
  }
  // 이슈는 이미 생성됨. 번호 저장 실패 시 임대가 끝나면 재시도되어 중복 이슈가 생길 수 있음 (로그로 추적)
  try {
    await deps.linkStore.markCreated(sentryIssueId, issueNumber);
  } catch (error) {
    console.error(
      `GitHub 이슈 #${issueNumber} 번호 저장 실패 (Sentry 이슈 ${sentryIssueId})`,
      error
    );
  }
};

// 이전에 실패한 행 재시도 (Sentry는 웹훅 재전송을 보장하지 않음)
const retryPending = async (deps: SentryWebhookDeps) => {
  const pending = await deps.linkStore.listPending(
    RETRY_BATCH,
    MAX_ATTEMPTS,
    deps.now() - LEASE_MS
  );
  for (const link of pending) {
    try {
      if (!(await deps.linkStore.lease(link.sentryIssueId, link.attempts))) continue;
      if (!link.payload?.title) {
        await deps.linkStore.markFailed(link.sentryIssueId, 'payload 없음');
        continue;
      }
      await attemptCreate(deps, link.sentryIssueId, link.payload);
    } catch (error) {
      console.error(`재시도 실패 (Sentry 이슈 ${link.sentryIssueId})`, error);
    }
  }
};

const createNew = async (deps: SentryWebhookDeps, sentryIssueId: string, payload: IssuePayload) => {
  if (!(await deps.linkStore.claim(sentryIssueId, payload))) return;
  await attemptCreate(deps, sentryIssueId, payload);
};

const runInBackground = async (
  deps: SentryWebhookDeps,
  current: { sentryIssueId: string; payload: IssuePayload } | null
) => {
  try {
    await retryPending(deps);
  } catch (error) {
    console.error('대기 중인 Sentry 이슈 재시도 실패', error);
  }
  if (!current) return;
  try {
    await createNew(deps, current.sentryIssueId, current.payload);
  } catch (error) {
    console.error(`Sentry 이슈 ${current.sentryIssueId} 처리 실패`, error);
  }
};

// 이벤트에서 새로 만들 GitHub 이슈를 고른다. 대상이 아니면 null
const pickCurrent = (
  request: SentryWebhookRequest
): { sentryIssueId: string; payload: IssuePayload } | null | 'invalid' => {
  // installation, issue 등 alert-rule 액션이 아닌 리소스는 무시
  if (request.resource !== 'event_alert') return null;
  const parsed = parseJson(request.body);
  if (parsed === undefined) return 'invalid';
  const event = extractEvent(parsed);
  if (!event || !isProductionEvent(event)) return null;
  const sentryIssueId = issueIdOf(event);
  if (!sentryIssueId) {
    console.warn('event_alert에 issue_id 없음, 건너뜀');
    return null;
  }
  return { sentryIssueId, payload: buildIssue(event) };
};

// Sentry Internal Integration 웹훅 → GitHub 이슈.
// Sentry는 약 1초 안에 응답을 받아야 하므로 검증·필터 후 바로 200을 주고 나머지는 background에서 처리
export const handleSentryWebhook = async (
  deps: SentryWebhookDeps,
  request: SentryWebhookRequest
): Promise<SentryWebhookResponse> => {
  if (!(await deps.verify(request.body, request.signature))) {
    return { status: 401, body: { ok: false, accepted: false, error: 'invalid signature' } };
  }

  const current = pickCurrent(request);
  const accepted = current !== null && current !== 'invalid';

  // 서명이 맞는 웹훅이면 종류와 상관없이 실패 행 복구를 함께 돌린다
  deps.background(runInBackground(deps, accepted ? current : null));

  if (current === 'invalid') {
    return { status: 400, body: { ok: false, accepted: false, error: 'invalid json' } };
  }
  return accepted ? { status: 200, body: { ok: true, accepted: true } } : ignored();
};
