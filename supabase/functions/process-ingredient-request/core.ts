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

const headers = {
  added: '✅ 재료 자동 추가',
  rejected: '🚫 재료 요청 거절',
  duplicate: '🔁 중복 재료 요청',
  failed: '⚠️ 재료 요청 처리 실패',
} as const;

export const formatSlackReport = (report: ProcessReport) => {
  const lines = [`${headers[report.status]}\n`, `요청 재료: ${report.requestName}`];

  if (report.matchedName) lines.push(`겹치는 기존 재료: ${report.matchedName}`);
  if (report.reason) lines.push(`판단 근거: ${report.reason}`);
  if (report.outcomes.length > 0) lines.push('', ...report.outcomes.map(formatOutcome));
  if (report.error) lines.push(`오류: ${report.error}`);

  return lines.join('\n');
};
