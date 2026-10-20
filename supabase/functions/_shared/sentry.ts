// Sentry Integration Platform 웹훅(event_alert) 처리용 순수 함수 모음. import 없음 (Deno/Vitest 공용)
// https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issue-alerts/

export interface SentryFrame {
  filename?: string | null;
  abs_path?: string | null;
  module?: string | null;
  function?: string | null;
  lineno?: number | null;
  colno?: number | null;
  in_app?: boolean | null;
}

export interface SentryExceptionValue {
  type?: string | null;
  value?: string | null;
  stacktrace?: { frames?: SentryFrame[] | null } | null;
}

// 웹훅 data.event. 모든 필드가 빠질 수 있다고 가정한다
export interface SentryEvent {
  title?: string | null;
  culprit?: string | null;
  issue_id?: string | number | null;
  web_url?: string | null;
  issue_url?: string | null;
  environment?: string | null;
  release?: string | null;
  level?: string | null;
  platform?: string | null;
  datetime?: string | null;
  tags?: unknown;
  exception?: { values?: SentryExceptionValue[] | null } | null;
}

const TITLE_LIMIT = 200;
const BODY_LIMIT = 60_000;
const FRAME_LIMIT = 10;
const EXCEPTION_VALUE_LIMIT = 5_000;
const ISSUE_TAGS = ['os', 'device', 'app.version'];

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// Sentry-Hook-Signature = hex(HMAC-SHA256(Client Secret, raw body))
export const verifySentrySignature = async (
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> => {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return timingSafeEqual(toHex(mac), signature.trim().toLowerCase());
};

// 앱 Sentry.init이 environment를 지정하지 않음 → RN SDK 릴리즈 빌드 기본값이 production
export const isProductionEvent = (event: SentryEvent) =>
  event.environment == null || event.environment === '' || event.environment === 'production';

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_RE =
  /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi;

// 이메일·IP 주소 제거
export const scrubPii = (text: string) =>
  text.replace(EMAIL_RE, '[email]').replace(IPV4_RE, '[ip]').replace(IPV6_RE, '[ip]');

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value
    : typeof value === 'number'
      ? String(value)
      : null;

const truncate = (text: string, limit: number) =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

const tagMap = (tags: unknown): Map<string, string> => {
  const map = new Map<string, string>();
  if (!Array.isArray(tags)) return map;
  for (const tag of tags) {
    // [key, value] 배열 또는 { key, value } 객체 모두 허용
    const [key, value] = Array.isArray(tag)
      ? tag
      : tag && typeof tag === 'object'
        ? [(tag as { key?: unknown }).key, (tag as { value?: unknown }).value]
        : [];
    const k = str(key);
    const v = str(value);
    if (k && v && !map.has(k)) map.set(k, v);
  }
  return map;
};

// 이벤트 URL(.../issues/{id}/events/{eventId}/)에서 이슈 웹 URL을 얻는다.
// issue_url은 API URL이라 사람이 보기 어려움
const issueWebUrl = (event: SentryEvent) => {
  const webUrl = str(event.web_url);
  const match = webUrl?.match(/^(.*\/issues\/[^/]+\/)events\/[^/]+\/?$/);
  return match ? match[1] : null;
};

const formatFrame = (frame: SentryFrame) => {
  const file = str(frame.filename) ?? str(frame.abs_path) ?? str(frame.module) ?? '?';
  const fn = str(frame.function) ?? '?';
  const line = typeof frame.lineno === 'number' ? `:${frame.lineno}` : '';
  const col = typeof frame.colno === 'number' && line ? `:${frame.colno}` : '';
  return `at ${fn} (${file}${line}${col})`;
};

// in_app 프레임 우선, 없으면 전체. Sentry 프레임은 오래된 것 → 최신 순이라 뒤집어 최신부터
export const selectFrames = (frames: SentryFrame[]): SentryFrame[] => {
  const valid = frames.filter((f) => f && typeof f === 'object');
  const inApp = valid.filter((f) => f.in_app === true);
  return [...(inApp.length > 0 ? inApp : valid)].reverse().slice(0, FRAME_LIMIT);
};

// 실제 오류(마지막 exception 값)를 사용. 연쇄 예외는 마지막이 최종 예외
const mainException = (event: SentryEvent): SentryExceptionValue | null => {
  const values = event.exception?.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[values.length - 1] ?? null;
};

export const buildIssue = (event: SentryEvent): { title: string; body: string } => {
  const rawTitle = str(event.title) ?? '(제목 없음)';
  const title = truncate(`[Sentry] ${scrubPii(rawTitle)}`, TITLE_LIMIT);

  const lines: string[] = [];
  const issueUrl = issueWebUrl(event);
  const eventUrl = str(event.web_url);

  lines.push('## 링크');
  lines.push(`- Sentry 이슈: ${issueUrl ?? '(알 수 없음)'}`);
  lines.push(`- Sentry 이벤트: ${eventUrl ?? '(알 수 없음)'}`);
  lines.push('');

  lines.push('## 정보');
  lines.push('| 항목 | 값 |');
  lines.push('| --- | --- |');
  const rows: [string, unknown][] = [
    ['환경', event.environment ?? 'production (미지정)'],
    ['릴리즈', event.release],
    ['레벨', event.level],
    ['플랫폼', event.platform],
    ['최초 발생', event.datetime],
    ['Sentry 이슈 ID', event.issue_id],
  ];
  for (const [label, value] of rows) lines.push(`| ${label} | ${str(value) ?? '-'} |`);
  lines.push('');

  const culprit = str(event.culprit);
  if (culprit) {
    lines.push('## 발생 위치 (culprit)');
    lines.push('`' + culprit.replace(/`/g, "'") + '`');
    lines.push('');
  }

  const exception = mainException(event);
  if (exception) {
    const type = str(exception.type);
    const rawValue = str(exception.value);
    const value = rawValue && truncate(rawValue, EXCEPTION_VALUE_LIMIT);
    lines.push('## 예외');
    lines.push('```');
    lines.push([type, value].filter(Boolean).join(': ') || '(내용 없음)');
    lines.push('```');
    lines.push('');

    const frames = exception.stacktrace?.frames;
    if (Array.isArray(frames) && frames.length > 0) {
      const selected = selectFrames(frames);
      const inApp = selected.some((f) => f.in_app === true);
      lines.push(`## 스택 트레이스 (${inApp ? '앱 코드' : '전체'}, 최신 ${selected.length}개)`);
      lines.push('```');
      for (const frame of selected) lines.push(formatFrame(frame));
      lines.push('```');
      lines.push('');
    }
  }

  // 지정한 태그만 노출 (user 등 개인정보 태그는 포함하지 않음)
  const tags = tagMap(event.tags);
  const picked = ISSUE_TAGS.filter((key) => tags.has(key));
  if (picked.length > 0) {
    lines.push('## 태그');
    for (const key of picked) lines.push(`- ${key}: ${tags.get(key)}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('_Sentry 알림으로 자동 생성된 이슈입니다._');

  const body = scrubPii(lines.join('\n'));
  return { title, body: truncate(body, BODY_LIMIT) };
};
