import type {
  CandidateIngredient,
  ExistingIngredient,
  IngredientOutcome,
  Judgement,
  ProcessReport,
  WebhookPayload,
  Week,
} from './types.ts';

export const MAX_CANDIDATES = 4;

export class JudgementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgementParseError';
  }
}

export const normalizeName = (name: string) => name.trim().replace(/\s/g, '');

export const findExactMatch = (name: string, existing: ExistingIngredient[]) => {
  const target = normalizeName(name);
  return (
    existing.find((ingredient) =>
      [ingredient.name, ...ingredient.subKeywords].some((n) => normalizeName(n) === target)
    ) ?? null
  );
};

export const getProcessMode = ({ type, record, old_record }: WebhookPayload) => {
  if (record?.status !== 'pending') return null;
  if (type === 'INSERT') return 'new';
  if (type === 'UPDATE' && old_record?.status !== 'pending') return 'retry';
  return null;
};

const extractJson = (text: string): unknown => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);

  try {
    return JSON.parse(body);
  } catch {
    throw new JudgementParseError(`JSON 파싱 실패: ${text.slice(0, 200)}`);
  }
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseCandidate = (raw: unknown): CandidateIngredient => {
  const c = (raw ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(c.name)) throw new JudgementParseError('후보 name 누락');
  if (c.week !== 1 && c.week !== 2 && c.week !== 3) {
    throw new JudgementParseError(`후보 week 범위 오류: ${c.week}`);
  }
  if (typeof c.isCarbohydrate !== 'boolean') {
    throw new JudgementParseError('후보 isCarbohydrate 누락');
  }
  if (!isNonEmptyString(c.imageQueryEn)) throw new JudgementParseError('후보 imageQueryEn 누락');

  const subKeywords = Array.isArray(c.subKeywords)
    ? c.subKeywords.filter(isNonEmptyString).map((k) => k.trim())
    : [];

  return {
    name: c.name.trim(),
    week: c.week as Week,
    isCarbohydrate: c.isCarbohydrate,
    subKeywords,
    imageQueryEn: c.imageQueryEn.trim(),
    reason: typeof c.reason === 'string' ? c.reason : '',
  };
};

export const parseJudgement = (text: string, existing: ExistingIngredient[]): Judgement => {
  const json = extractJson(text) as Record<string, unknown>;
  const reason = typeof json?.reason === 'string' ? json.reason : '';

  if (json?.decision === 'reject') return { decision: 'reject', reason };

  if (json?.decision === 'duplicate') {
    if (!isNonEmptyString(json.matchedName)) throw new JudgementParseError('matchedName 누락');
    return { decision: 'duplicate', reason, matchedName: json.matchedName.trim() };
  }

  if (json?.decision !== 'add') {
    throw new JudgementParseError(`알 수 없는 decision: ${json?.decision}`);
  }
  if (!Array.isArray(json.ingredients)) throw new JudgementParseError('ingredients 누락');

  const candidates = json.ingredients.map(parseCandidate);
  const seen = new Set<string>();
  const ingredients: CandidateIngredient[] = [];
  let firstMatchedName: string | null = null;

  for (const candidate of candidates) {
    const key = normalizeName(candidate.name);
    if (seen.has(key)) continue;
    seen.add(key);

    const match = findExactMatch(candidate.name, existing);
    if (match) {
      firstMatchedName ??= match.name;
      continue;
    }
    ingredients.push(candidate);
  }

  if (ingredients.length === 0) {
    if (firstMatchedName) return { decision: 'duplicate', reason, matchedName: firstMatchedName };
    throw new JudgementParseError('추가할 후보가 없음');
  }

  return { decision: 'add', reason, ingredients: ingredients.slice(0, MAX_CANDIDATES) };
};

export const decideFinalStatus = (outcomes: IngredientOutcome[]) =>
  outcomes.some((o) => o.status === 'added') ? ('added' as const) : ('failed' as const);

const weekLabel = (week: Week) => (week === 3 ? '3주차 +' : `${week}주차`);
const imageSourceLabel = { pixabay: 'Pixabay', generated: 'AI 생성' } as const;

const formatOutcome = ({ candidate, status, imageUrl, imageSource, error }: IngredientOutcome) => {
  if (status === 'failed') return `• ❌ ${candidate.name}: ${error ?? '실패'}`;

  const carb = candidate.isCarbohydrate ? ' / 탄수화물' : '';
  const source = imageSource ? ` (${imageSourceLabel[imageSource]})` : '';
  return [
    `• ✅ ${candidate.name} [${weekLabel(candidate.week)}${carb}]`,
    `  이미지${source}: ${imageUrl}`,
    candidate.reason ? `  근거: ${candidate.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const HIDDEN_HEADER = '🙈 숨긴 재료 재요청';

const headers = {
  added: '✅ 재료 자동 추가',
  rejected: '🚫 재료 요청 거절',
  duplicate: '🔁 중복 재료 요청',
  failed: '⚠️ 재료 요청 처리 실패',
} as const;

export const formatSlackReport = (report: ProcessReport) => {
  const header = report.hiddenIngredient ? HIDDEN_HEADER : headers[report.status];
  const lines = [`${header}\n`, `요청 재료: ${report.requestName}`];

  if (report.hiddenIngredient) lines.push(`숨긴 재료: ${report.hiddenIngredient.name}`);

  if (report.matchedName) lines.push(`겹치는 기존 재료: ${report.matchedName}`);
  if (report.reason) lines.push(`판단 근거: ${report.reason}`);
  if (report.outcomes.length > 0) lines.push('', ...report.outcomes.map(formatOutcome));
  if (report.error) lines.push(`오류: ${report.error}`);

  return lines.join('\n');
};

// verify_jwt가 서명을 검증한 뒤이므로, 여기서는 role만 확인 (anon 키·유저 토큰 차단)
export const isServiceRoleRequest = (authorization: string | null) => {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (!payload) return false;

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role === 'service_role';
  } catch {
    return false;
  }
};

const STALE_PENDING_MS = 10 * 60 * 1000;

interface PriorRequest {
  id: number;
  status: string;
  created_at: string;
}

// 같은 이름의 다른 요청 때문에 이번 요청을 처리하지 않아도 되는지.
// duplicate/failed는 막지 않음 (실패한 이름은 다시 요청하면 재처리 — 스펙 4.7)
export const isBlockedByPriorRequests = (
  self: PriorRequest,
  others: PriorRequest[],
  now: Date = new Date()
) =>
  others.some(
    (r) =>
      r.status === 'added' ||
      r.status === 'rejected' ||
      (r.status === 'pending' &&
        r.id < self.id &&
        now.getTime() - new Date(r.created_at).getTime() < STALE_PENDING_MS)
  );

export class DeadlineExceededError extends Error {
  constructor(ms: number) {
    super(`처리 시간 초과 (${Math.round(ms / 1000)}초)`);
    this.name = 'DeadlineExceededError';
  }
}

export const withDeadline = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(ms)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
};

export interface RequesterNotification {
  title: string;
  body: string;
  href: string | null;
}

const LOW_CARB_SCREEN = '/(tabs)/home/recipeCreation/low';
const ZERO_CARB_SCREEN = '/(tabs)/home/recipeCreation/zero';

// 요청한 유저에게 보낼 결과 알림. 처리 실패는 운영자만 받음 (재처리 후 결과를 보냄)
export const buildRequesterNotification = (report: ProcessReport): RequesterNotification | null => {
  const name = report.requestName;

  if (report.status === 'added') {
    const added = report.outcomes.filter((o) => o.status === 'added').map((o) => o.candidate);
    const others = added.filter((c) => normalizeName(c.name) !== normalizeName(name));
    const allZeroCarb = added.every((c) => !c.isCarbohydrate);
    return {
      title: `🥗 요청하신 '${added[0]?.name ?? name}' 재료가 추가됐어요!`,
      body:
        others.length > 0
          ? `${others.map((c) => c.name).join(', ')}도 함께 추가됐어요. 지금 레시피에 써보세요.`
          : '지금 레시피에 써보세요.',
      href: allZeroCarb ? ZERO_CARB_SCREEN : LOW_CARB_SCREEN,
    };
  }

  if (report.hiddenIngredient) {
    return {
      title: '재료 요청 결과',
      body: `요청하신 '${name}'은(는) 검토 결과 추가되지 않았어요.`,
      href: null,
    };
  }

  if (report.status === 'rejected') {
    return {
      title: '재료 요청 결과',
      body: `요청하신 '${name}'은(는) 스위치온 다이어트 기준에 맞지 않아 추가되지 않았어요. ${report.reason}`.trim(),
      href: null,
    };
  }

  if (report.status === 'duplicate') {
    return {
      title: '재료 요청 결과',
      body: report.matchedName
        ? `요청하신 '${name}'은(는) 이미 '${report.matchedName}'(으)로 등록돼 있어요.`
        : `요청하신 '${name}'은(는) 이미 검토된 재료예요. 재료 목록을 확인해주세요.`,
      href: null,
    };
  }

  return null;
};

// 운영자가 숨긴(롤백한) 재료와 같은 재료인지. 다시 AI 판단에 맡기면 그대로 재추가될 수 있음
export const findHiddenIngredient = (name: string, existing: ExistingIngredient[]) => {
  const match = findExactMatch(name, existing);
  return match && !match.isActive && match.id != null ? { id: match.id, name: match.name } : null;
};

export const hiddenRejectionReport = (
  requestName: string,
  hiddenIngredient: { id: number; name: string }
): ProcessReport => ({
  requestName,
  status: 'rejected',
  reason: '운영자가 숨긴 재료',
  hiddenIngredient,
  outcomes: [],
});
