// 비슷한 레시피 점수: 순수 로직.
// 재료(정규화 후) Jaccard ×10 + 같은 종류 2 + 같은 방식 1 + 같은 맵기 0.5 (태그는 둘 다 값이 있을 때만).
// 공유 재료가 하나도 없으면 종류와 방식이 모두 같을 때만 후보로 남긴다.
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
}

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

// 같은 요리를 다른 행으로 다시 만든 경우를 거르기 위한 이름 비교 키
export function normalizeRecipeName(name: string | null): string {
  return (name ?? '').toLowerCase().replace(/\s+/g, '');
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

const featuresOf = (r: SimilarCandidate, normalize: (name: string) => string): Features => ({
  names: ingredientSetOf(r.ingredients, normalize),
  cuisine: r.cuisine,
  method: r.method,
  spicy: r.spicy,
});

// 후보마다 점수를 매겨 점수 내림차순으로 (동점 순서는 rankSimilar가 정한다).
// 자기 자신, 정규화한 이름이 같은 레시피, 조건에 못 미치는 후보는 뺀다
export function scoreCandidates(
  target: SimilarCandidate,
  candidates: SimilarCandidate[],
  normalize: (name: string) => string
): Scored[] {
  const t = featuresOf(target, normalize);
  const targetName = normalizeRecipeName(target.recipe_name);
  const scored: Scored[] = [];
  for (const c of candidates) {
    if (c.id === target.id) continue;
    if (targetName && normalizeRecipeName(c.recipe_name) === targetName) continue;
    const score = similarityScore(t, featuresOf(c, normalize));
    if (score !== null) scored.push({ id: c.id, score });
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

// 점수 내림차순, 같으면 저장 수 내림차순, 그다음 id 내림차순(최신)으로 limit개의 id
export function rankSimilar(
  scored: Scored[],
  savedCounts: Record<number, number>,
  limit: number
): number[] {
  return [...scored]
    .sort(
      (a, b) =>
        b.score - a.score || (savedCounts[b.id] ?? 0) - (savedCounts[a.id] ?? 0) || b.id - a.id
    )
    .slice(0, limit)
    .map((s) => s.id);
}
