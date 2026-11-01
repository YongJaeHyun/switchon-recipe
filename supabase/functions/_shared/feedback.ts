// 앱 리뷰 묻기에서 [아쉬워요]로 받은 사용자 의견 (send-feedback). 순수 부분만: 요청 검사·하루 한 번 판단·Slack 문구.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

export const FEEDBACK_MAX_LENGTH = 500;
// 이보다 긴 원문은 앱이 보낸 것이 아니다 (앱은 500자에서 막는다) → 거절. 그 사이는 잘라서 받는다
const FEEDBACK_RAW_MAX_LENGTH = 2000;

export const FEEDBACK_TRIGGERS = ['week2', 'saved3'] as const;
export type FeedbackTrigger = (typeof FEEDBACK_TRIGGERS)[number];

const TRIGGER_LABEL: Record<FeedbackTrigger, string> = {
  week2: '2주차 진입',
  saved3: '레시피 3개 저장',
};

export interface FeedbackInput {
  message: string;
  trigger: FeedbackTrigger;
  appVersion: string | null;
  week: number | null;
  hasPass: boolean | null;
}

// 제어 문자(줄바꿈 제외)를 빼고, 탭은 공백으로, 빈 줄은 하나까지, 앞뒤 공백 제거, 500자(코드 포인트)로 자른다
export function sanitizeFeedbackMessage(raw: string): string {
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const chars = [...cleaned];
  return chars.length > FEEDBACK_MAX_LENGTH
    ? chars.slice(0, FEEDBACK_MAX_LENGTH).join('').trimEnd()
    : cleaned;
}

const isTrigger = (value: unknown): value is FeedbackTrigger =>
  typeof value === 'string' && (FEEDBACK_TRIGGERS as readonly string[]).includes(value);

const versionOf = (value: unknown) =>
  typeof value === 'string' && /^[0-9A-Za-z.+-]{1,20}$/.test(value) ? value : null;

const weekOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 52 ? value : null;

export type FeedbackParseResult = { ok: true; value: FeedbackInput } | { ok: false; error: string };

export function parseFeedbackRequest(body: unknown): FeedbackParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body' };
  }
  const input = body as Record<string, unknown>;
  if (typeof input.message !== 'string' || input.message.length > FEEDBACK_RAW_MAX_LENGTH) {
    return { ok: false, error: 'invalid_message' };
  }
  const message = sanitizeFeedbackMessage(input.message);
  if (!message) return { ok: false, error: 'empty_message' };
  if (!isTrigger(input.trigger)) return { ok: false, error: 'invalid_trigger' };

  return {
    ok: true,
    value: {
      message,
      trigger: input.trigger,
      appVersion: versionOf(input.app_version),
      week: weekOf(input.week),
      hasPass: typeof input.has_pass === 'boolean' ? input.has_pass : null,
    },
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const kstDayOf = (date: Date) =>
  new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 한 사람당 KST 하루 한 번. lastCreatedAt: 그 사람이 마지막으로 보낸 시각 (없으면 null)
export function isFeedbackRateLimited(lastCreatedAt: string | null, now: Date): boolean {
  if (!lastCreatedAt) return false;
  const last = Date.parse(lastCreatedAt);
  if (!Number.isFinite(last)) return false;
  return kstDayOf(new Date(last)) === kstDayOf(now);
}

export const FEEDBACK_RATE_LIMIT_MESSAGE =
  '오늘은 이미 의견을 보내 주셨어요. 내일 다시 보내 주세요';

// Slack이 특수 문법(<!channel>, <링크|글자>, 멘션)으로 읽지 않게 &, <, >를 바꾼다
const escapeSlack = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// uid·이메일 등 개인 정보는 넣지 않는다 (uid는 DB에만)
export function buildFeedbackSlackText(input: FeedbackInput): string {
  const pass = input.hasPass === null ? '?' : input.hasPass ? '있음' : '없음';
  return [
    `💬 사용자 의견 (${TRIGGER_LABEL[input.trigger]})`,
    escapeSlack(input.message),
    `앱 ${input.appVersion ?? '?'} · ${input.week ?? '?'}주차 · 패스 ${pass}`,
  ].join('\n');
}
