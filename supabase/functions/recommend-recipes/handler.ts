// 맞춤 레시피 추천 요청 처리 본체. 외부 의존성(인증, 패스, DB)은 deps로 받아 Vitest(node)에서
// 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 흐름: 인증 -> 본문 검증(값 목록 밖이면 400) -> 패스 확인(402) -> 주차·끼니 계산(쉐이크면 빈 목록)
// -> 제외 재료(요청 목록, 생략 시 저장된 목록, mergeSaved면 둘의 합집합. 최대 30개) -> 후보 조회(week <= min(주차,4), 이미지 있는 레시피) -> 재료 정규화 필터
// -> 무작위 5개 -> 카드용 행 조회 + 저장 여부·저장 수를 붙여 recipe_with_is_saved 행 모양으로 응답.

import {
  buildIngredientNormalizer,
  excludeByContainment,
  type RegisteredIngredient,
} from '../_shared/ingredientNormalize.ts';
import {
  assertPremium,
  type PremiumCheckClient,
  PremiumRequiredError,
  premiumRequiredResponse,
} from '../_shared/premium.ts';
import { CUISINES, type Cuisine, type Method, METHODS } from '../_shared/recipeTags.ts';
import {
  filterRecipes,
  type Meal,
  mealKind,
  pickRecommendations,
  type RecipeRow,
  type RecommendConditions,
  stepOf,
} from '../_shared/recommend.ts';
import { programDayOf, programWeekOf } from '../_shared/week.ts';

export const RECOMMEND_COUNT = 5;
export const MAX_MUST_INCLUDE = 2;
export const MAX_EXCLUDE = 30;
export const MAX_RECOMMEND_WEEK = 4;
const MAX_BODY_BYTES = 16 * 1024;
const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner'];
const MAX_MINUTES = [15, 30] as const;

// 후보 조회 결과 (recipe 테이블에서 필터에 필요한 열만). ingredients는 JSON 문자열
export interface RecipeCandidateRow {
  id: number;
  week: number | null;
  is_zero_carb: boolean | null;
  cooking_time: number | null;
  ingredients: string | null;
  spicy: boolean | null;
  cuisine: string | null;
  method: string | null;
}

// 카드·상세 화면에 필요한 recipe 열 (recipe_with_is_saved 뷰에서 저장 관련 열을 뺀 것)
export interface RecipeCardRow {
  id: number;
  recipe_name: string | null;
  image_uri: string | null;
  ingredients: string | null;
  cooking_steps: string | null;
  cooking_time: number | null;
  nutrition: string | null;
  is_zero_carb: boolean | null;
  week: number | null;
  created_at: string;
  uid: string | null;
  // 기준 인분 (모르면 null, 상세 화면 인분 조절에 쓴다)
  servings: number | null;
}

// 앱 RecipeWithIsSavedDB와 같은 모양
export interface RecommendedRecipe extends RecipeCardRow {
  is_saved: boolean;
  saved_at: string | null;
  saved_count: number;
}

export interface RecommendDeps {
  getUid(req: Request): Promise<string | null>;
  premiumClient: PremiumCheckClient;
  getStartDate(uid: string): Promise<string | null>;
  now(): Date;
  random(): number;
  // user_recipe_preference.excluded_ingredients (없으면 [])
  getExcludedIngredients(uid: string): Promise<string[]>;
  // 활성 등록 재료 (정규화 기준)
  getRegisteredIngredients(): Promise<RegisteredIngredient[]>;
  // 이미지가 있고 week <= maxWeek인 레시피
  fetchCandidates(maxWeek: number): Promise<RecipeCandidateRow[]>;
  fetchCards(ids: number[]): Promise<RecipeCardRow[]>;
  // 이 유저가 저장한 기록 (해당 id만)
  fetchOwnSaves(uid: string, ids: number[]): Promise<{ recipe_id: number; created_at: string }[]>;
  // 다른 유저들의 저장 수 (앱 카드는 saved_count + 내 저장 여부로 표시하므로 내 저장은 뺀다)
  countOtherSaves(uid: string, ids: number[]): Promise<Record<number, number>>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

class BadRequestError extends Error {}

const readBody = async (req: Request): Promise<unknown> => {
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new BadRequestError('요청이 너무 큽니다');
  if (buffer.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new BadRequestError('본문이 JSON이 아닙니다');
  }
};

const oneOf = <T>(value: unknown, list: readonly T[], field: string): T | null => {
  if (value === undefined || value === null) return null;
  if (!(list as readonly unknown[]).includes(value)) {
    throw new BadRequestError(`${field} 값이 올바르지 않습니다`);
  }
  return value as T;
};

const stringList = (value: unknown, field: string, max: number): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new BadRequestError(`${field} 값이 올바르지 않습니다`);
  }
  const list = (value as string[]).map((v) => v.trim()).filter((v) => v.length > 0);
  if (list.length > max) throw new BadRequestError(`${field}는 최대 ${max}개입니다`);
  return list;
};

// mergeSaved: true면 요청 exclude ∪ 저장된 목록 (앱이 저장 목록을 못 받은 채 화면 목록을 고친 경우)
export type RecommendRequest = RecommendConditions & { mergeSaved: boolean };

// 공백을 다듬고 빈 문자열·중복을 뺀 뒤 MAX_EXCLUDE개까지 (앞쪽이 먼저 남는다)
const capExclude = (list: string[]): string[] =>
  [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, MAX_EXCLUDE);

export const parseConditions = (body: unknown): RecommendRequest => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestError('잘못된 요청입니다');
  }
  const b = body as Record<string, unknown>;
  if (b.spicy !== undefined && b.spicy !== null && typeof b.spicy !== 'boolean') {
    throw new BadRequestError('spicy 값이 올바르지 않습니다');
  }
  if (b.mergeSaved !== undefined && b.mergeSaved !== null && typeof b.mergeSaved !== 'boolean') {
    throw new BadRequestError('mergeSaved 값이 올바르지 않습니다');
  }
  return {
    spicy: (b.spicy as boolean | null | undefined) ?? null,
    cuisine: oneOf<Cuisine>(b.cuisine, CUISINES, 'cuisine'),
    method: oneOf<Method>(b.method, METHODS, 'method'),
    maxMinutes: oneOf(b.maxMinutes, MAX_MINUTES, 'maxMinutes'),
    meal: oneOf<Meal>(b.meal, MEALS, 'meal'),
    mustInclude: stringList(b.mustInclude, 'mustInclude', MAX_MUST_INCLUDE),
    // 생략(undefined/null)과 빈 배열을 구분한다: 생략이면 저장된 제외 재료를 쓴다
    exclude:
      b.exclude === undefined || b.exclude === null
        ? undefined
        : stringList(b.exclude, 'exclude', MAX_EXCLUDE),
    mergeSaved: b.mergeSaved === true,
  };
};

// recipe.ingredients(JSON 문자열: 옛 형식 문자열 배열 또는 { name } 배열)를 이름 목록으로.
// 해석할 수 없거나 모양을 알 수 없는 항목이 하나라도 있으면 null
// (제외 재료를 확인할 수 없으므로 후보에서 뺀다)
const ingredientNames = (raw: string | null): { name: string }[] | null => {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const names: { name: string }[] = [];
  for (const i of parsed) {
    if (typeof i === 'string') names.push({ name: i });
    else if (
      typeof i === 'object' &&
      i !== null &&
      typeof (i as { name?: unknown }).name === 'string'
    ) {
      names.push({ name: (i as { name: string }).name });
    } else return null;
  }
  return names;
};

const toRecipeRow = (c: RecipeCandidateRow): RecipeRow | null => {
  if (c.week === null) return null;
  const ingredients = ingredientNames(c.ingredients);
  if (!ingredients) return null;
  return {
    id: c.id,
    week: c.week,
    is_zero_carb: c.is_zero_carb === true,
    // 조리 시간이 없으면 시간 조건에 걸리지 않게 한다
    cooking_time: c.cooking_time ?? Number.POSITIVE_INFINITY,
    ingredients,
    spicy: c.spicy,
    cuisine: c.cuisine,
    method: c.method,
  };
};

export async function handleRecommend(req: Request, deps: RecommendDeps): Promise<Response> {
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let request: RecommendRequest;
    try {
      request = parseConditions(await readBody(req));
    } catch (error) {
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }
    const { mergeSaved, ...conditions } = request;

    try {
      await assertPremium(deps.premiumClient, uid);
    } catch (error) {
      if (error instanceof PremiumRequiredError) return premiumRequiredResponse(error);
      throw error;
    }

    const startDate = await deps.getStartDate(uid);
    const now = deps.now();
    const week = programWeekOf(startDate, now);
    const day = programDayOf(startDate, now);

    if (conditions.meal && mealKind(stepOf(week, day), conditions.meal) === 'shake') {
      return json({ recipes: [], totalMatches: 0, reason: 'shake' }, 200);
    }

    // 요청에 exclude가 있으면 그 목록 그대로(앱이 화면의 목록을 보낸다), 생략했으면 저장된 목록.
    // mergeSaved면 요청 목록 ∪ 저장된 목록 (요청 목록이 먼저). 어느 경우든 MAX_EXCLUDE개까지
    const requested = conditions.exclude;
    const loadExclude = async (): Promise<string[]> => {
      if (requested && !mergeSaved) return requested;
      const stored = await deps.getExcludedIngredients(uid);
      return requested ? [...requested, ...stored] : stored;
    };
    const [excludeSource, registered, candidates] = await Promise.all([
      loadExclude(),
      deps.getRegisteredIngredients(),
      deps.fetchCandidates(Math.min(week, MAX_RECOMMEND_WEEK)),
    ]);
    const exclude = capExclude(excludeSource);
    const normalize = buildIngredientNormalizer(registered);
    const rows = candidates.map(toRecipeRow).filter((r): r is RecipeRow => r !== null);
    // 제외는 포함 여부로 먼저 거른다 (정확 일치만 보면 "닭가슴살 소시지"·"양념장 (고추장, …)"이 빠져나감).
    // filterRecipes의 정확 일치 제외도 그대로 둔다. 필수 재료는 정규화 후 정확 일치
    const kept = excludeByContainment(rows, exclude, registered);
    const matched = filterRecipes(kept, { ...conditions, exclude }, { week, day }, normalize);
    if (matched.length === 0) return json({ recipes: [], totalMatches: 0 }, 200);

    const ids = pickRecommendations(matched, RECOMMEND_COUNT, deps.random).map((r) => r.id);
    const [cards, ownSaves, otherCounts] = await Promise.all([
      deps.fetchCards(ids),
      deps.fetchOwnSaves(uid, ids),
      deps.countOtherSaves(uid, ids),
    ]);
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const savedAt = new Map(ownSaves.map((s) => [s.recipe_id, s.created_at]));

    // 고른 순서를 유지한다 (조회 사이에 지워진 레시피는 뺀다)
    const recipes: RecommendedRecipe[] = ids.flatMap((id) => {
      const c = cardById.get(id);
      if (!c) return [];
      return [
        {
          ...c,
          is_saved: savedAt.has(id),
          saved_at: savedAt.get(id) ?? null,
          saved_count: otherCounts[id] ?? 0,
        },
      ];
    });

    return json({ recipes, totalMatches: matched.length }, 200);
  } catch (error) {
    console.error('맞춤 레시피 추천 실패:', error);
    return json({ error: '추천에 실패했어요. 잠시 후 다시 시도해 주세요' }, 500);
  }
}
