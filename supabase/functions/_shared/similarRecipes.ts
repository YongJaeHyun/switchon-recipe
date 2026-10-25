// 비슷한 레시피 점수: 순수 로직.
// 재료(정규화 후) Jaccard ×10 + 같은 종류 2 + 같은 방식 1 + 같은 맵기 0.5 (태그는 둘 다 값이 있을 때만).
// 공유 재료가 하나도 없으면 종류와 방식이 모두 같을 때만 후보로 남긴다.
// 흔한 양념·기름·물(STOP_INGREDIENTS)은 재료 비교에서 뺀다. 결과 안에서 거의 같은 요리는 하나만 남긴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

// recipe 행에서 점수에 필요한 열. ingredients는 JSON 문자열
export interface SimilarCandidate {
  id: number;
  recipe_name: string | null;
  ingredients: string | null;
  cuisine: string | null;
  method: string | null;
  spicy: boolean | null;
}

export interface Scored {
  id: number;
  score: number;
  // 결과 안 중복 판정 키 (rankSimilar). 없으면 그 기준으로는 중복으로 보지 않는다
  nameKey?: string;
  ingredientKey?: string | null;
}

// 재료 비교에서 빼는 양념·조미료·기름·물 (정규화한 이름 기준: 소문자·공백·괄호 제거 후 등록 재료 이름).
// 2026-10-25 실데이터 607개 레시피의 재료 빈도 상위에서 골랐다. 거의 모든 레시피에 들어가
// "공유 재료 1개 이상" 조건을 무의미하게 만들고 Jaccard를 흐리기 때문이다.
// - 마늘(434회)·대파(92)·쪽파·생강·고추: 향신 채소로 맛을 내는 용도가 대부분이라 뺀다
// - 양파(147)·파채: 볶음·샐러드의 실제 채소로 쓰이는 경우가 많아 남긴다
// - 된장·김치: 요리의 정체성을 정하는 재료(된장국·김치볶음)라 남긴다. 고추장은 맵기 태그가 대신한다
// - 계란·두부·닭가슴살 등 주재료는 흔해도 남긴다
export const STOP_INGREDIENTS: ReadonlySet<string> = new Set([
  // 소금·후추·간장류
  '소금',
  '소금약간',
  '후추',
  '간장',
  '굴소스',
  '저당굴소스',
  '참치액젓',
  '멸치액젓',
  '맛술',
  '식초',
  '레몬즙',
  '고춧가루',
  '고추장',
  '와사비',
  '홀그레인머스타드',
  '머스타드',
  '마요네즈',
  '오리엔탈소스',
  // 감미료
  '알룰로스',
  '에리스리톨',
  '스테비아',
  '에리스리톨또는스테비아',
  '스테비아또는에리스리톨',
  '설탕',
  '올리고당',
  // 기름·지방
  '참기름',
  '들기름',
  '냉압착들기름',
  '올리브',
  '올리브유',
  '식용유',
  '버터',
  // 깨
  '깨',
  '통깨',
  '깨소금',
  // 물·육수
  '물',
  '물또는육수',
  '물또는멸치육수',
  '다시마',
  // 향신 채소·허브
  '마늘',
  '대파',
  '쪽파',
  '생강',
  '고추',
  '파슬리',
  '로즈마리',
  '신선한딜',
]);

export const isStopIngredient = (normalizedName: string): boolean =>
  STOP_INGREDIENTS.has(normalizedName);

interface Features {
  names: Set<string>;
  cuisine: string | null;
  method: string | null;
  spicy: boolean | null;
}

const JACCARD_WEIGHT = 10;
const CUISINE_BONUS = 2;
const METHOD_BONUS = 1;
const SPICY_BONUS = 0.5;

// recipe.ingredients(옛 형식 문자열 배열 또는 { name } 배열)를 정규화한 이름 집합으로.
// 해석할 수 없으면 빈 집합, 모양을 모르는 항목은 건너뛴다 (점수만 낮아질 뿐 빼지는 않는다)
export function ingredientSetOf(
  raw: string | null,
  normalize: (name: string) => string
): Set<string> {
  const names = new Set<string>();
  if (!raw) return names;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return names;
  }
  if (!Array.isArray(parsed)) return names;
  for (const item of parsed) {
    const name =
      typeof item === 'string'
        ? item
        : typeof item === 'object' &&
            item !== null &&
            typeof (item as { name?: unknown }).name === 'string'
          ? (item as { name: string }).name
          : null;
    if (name === null) continue;
    const n = normalize(name);
    if (n) names.add(n);
  }
  return names;
}

// 같은 요리를 다른 행으로 다시 만든 경우를 거르기 위한 이름 비교 키.
// 괄호(반각·전각) 안 설명("(스위치온 다이어트 1주차)")을 떼고, 소문자로 바꾸고, 글자·숫자만 남긴다
export function recipeNameKey(name: string | null): string {
  return (name ?? '')
    .replace(/\([^)]*\)|（[^）]*）/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const sameTag = <T>(a: T | null, b: T | null) => a !== null && b !== null && a === b;

// 두 레시피의 점수. 조건(공유 재료 1개 이상, 또는 종류·방식 모두 같음)에 못 미치면 null
export function similarityScore(a: Features, b: Features): number | null {
  let shared = 0;
  for (const n of a.names) if (b.names.has(n)) shared++;
  const union = a.names.size + b.names.size - shared;
  const sameCuisine = sameTag(a.cuisine, b.cuisine);
  const sameMethod = sameTag(a.method, b.method);
  if (shared === 0 && !(sameCuisine && sameMethod)) return null;

  const jaccard = union === 0 ? 0 : shared / union;
  return (
    jaccard * JACCARD_WEIGHT +
    (sameCuisine ? CUISINE_BONUS : 0) +
    (sameMethod ? METHOD_BONUS : 0) +
    (sameTag(a.spicy, b.spicy) ? SPICY_BONUS : 0)
  );
}

// 양념을 뺀 재료 집합과 태그
const featuresOf = (r: SimilarCandidate, normalize: (name: string) => string): Features => ({
  names: new Set(
    [...ingredientSetOf(r.ingredients, normalize)].filter((n) => !isStopIngredient(n))
  ),
  cuisine: r.cuisine,
  method: r.method,
  spicy: r.spicy,
});

// 양념을 뺀 재료 집합 + 종류 + 방식이 모두 같으면 같은 키. 재료가 없거나 태그가 비면 null (판정하지 않음)
const ingredientKeyOf = (f: Features): string | null => {
  if (f.names.size === 0 || f.cuisine === null || f.method === null) return null;
  return JSON.stringify([[...f.names].sort(), f.cuisine, f.method]);
};

// 후보마다 점수를 매겨 점수 내림차순으로 (동점 순서는 rankSimilar가 정한다).
// 자기 자신, 이름 키(recipeNameKey)가 기준 레시피와 같은 레시피, 조건에 못 미치는 후보는 뺀다
export function scoreCandidates(
  target: SimilarCandidate,
  candidates: SimilarCandidate[],
  normalize: (name: string) => string
): Scored[] {
  const t = featuresOf(target, normalize);
  const targetName = recipeNameKey(target.recipe_name);
  const scored: Scored[] = [];
  for (const c of candidates) {
    if (c.id === target.id) continue;
    const nameKey = recipeNameKey(c.recipe_name);
    if (targetName && nameKey === targetName) continue;
    const f = featuresOf(c, normalize);
    const score = similarityScore(t, f);
    if (score !== null)
      scored.push({ id: c.id, score, nameKey, ingredientKey: ingredientKeyOf(f) });
  }
  return scored.sort((a, b) => b.score - a.score);
}

// 점수 내림차순 목록에서 상위 limit개 안에 들 수 있는 후보 (limit번째 점수 이상, 동점 포함).
// 동점 정렬에 필요한 저장 수는 이 후보들만 조회한다
export function contenders(scoredDesc: Scored[], limit: number): Scored[] {
  if (scoredDesc.length <= limit) return scoredDesc;
  const cutoff = scoredDesc[limit - 1].score;
  return scoredDesc.filter((s) => s.score >= cutoff);
}

// 점수 내림차순, 같으면 저장 수 내림차순, 그다음 id 내림차순(최신)으로 정렬한 뒤
// 앞서 고른 것과 이름 키나 재료 키가 같은 후보(거의 같은 요리)는 건너뛰며 limit개의 id
export function rankSimilar(
  scored: Scored[],
  savedCounts: Record<number, number>,
  limit: number
): number[] {
  const ranked = [...scored].sort(
    (a, b) =>
      b.score - a.score || (savedCounts[b.id] ?? 0) - (savedCounts[a.id] ?? 0) || b.id - a.id
  );
  const names = new Set<string>();
  const ingredients = new Set<string>();
  const picked: number[] = [];
  for (const s of ranked) {
    if (picked.length >= limit) break;
    if (s.nameKey && names.has(s.nameKey)) continue;
    if (s.ingredientKey && ingredients.has(s.ingredientKey)) continue;
    if (s.nameKey) names.add(s.nameKey);
    if (s.ingredientKey) ingredients.add(s.ingredientKey);
    picked.push(s.id);
  }
  return picked;
}
