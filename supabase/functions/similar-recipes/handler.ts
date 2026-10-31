// 비슷한 레시피 요청 처리 본체. 외부 의존성(인증, DB)은 deps로 받아 Vitest(node)에서
// 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 무료 기능이라 패스 확인은 하지 않는다 (로그인만 필요).
// 흐름: 인증 -> 본문 검증(recipeId 양의 정수, 아니면 400) -> 기준 레시피 조회(없으면 404)
// -> 주차 계산 -> 후보 조회(맞춤 추천과 같은 공개 범위: week <= min(주차,4), 이미지 있는 레시피)
// -> 점수(_shared/similarRecipes.ts, 양념 제외) -> 동점 후보까지 저장 기록 조회 -> 거의 같은 요리를 뺀 상위 6개
// -> 카드용 행 조회 + 저장 여부·저장 수를 붙여 recipe_with_is_saved 행 모양으로 응답.

import {
  buildIngredientNormalizer,
  type RegisteredIngredient,
} from '../_shared/ingredientNormalize.ts';
import {
  contenders,
  rankSimilar,
  scoreCandidates,
  type SimilarCandidate,
} from '../_shared/similarRecipes.ts';
import { programWeekOf } from '../_shared/week.ts';

export const SIMILAR_COUNT = 6;
export const MAX_SIMILAR_WEEK = 4;
const MAX_BODY_BYTES = 1024;

// 카드·상세 화면에 필요한 recipe 열 (recommend-recipes의 RecipeCardRow와 같다)
export interface SimilarCardRow {
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
export interface SimilarRecipe extends SimilarCardRow {
  is_saved: boolean;
  saved_at: string | null;
  saved_count: number;
}

export interface SaveRow {
  recipe_id: number;
  uid: string;
  created_at: string;
}

export interface SimilarDeps {
  getUid(req: Request): Promise<string | null>;
  getStartDate(uid: string): Promise<string | null>;
  now(): Date;
  // 기준 레시피 (공개 범위와 관계없이 id로)
  fetchRecipe(id: number): Promise<SimilarCandidate | null>;
  // 활성 등록 재료 (정규화 기준)
  getRegisteredIngredients(): Promise<RegisteredIngredient[]>;
  // 이미지가 있고 week <= maxWeek인 레시피
  fetchCandidates(maxWeek: number): Promise<SimilarCandidate[]>;
  // 해당 레시피들의 저장 기록 (모든 유저)
  fetchSaves(ids: number[]): Promise<SaveRow[]>;
  fetchCards(ids: number[]): Promise<SimilarCardRow[]>;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

class BadRequestError extends Error {}

const parseRecipeId = async (req: Request): Promise<number> => {
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new BadRequestError('요청이 너무 큽니다');
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new BadRequestError('본문이 JSON이 아닙니다');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestError('잘못된 요청입니다');
  }
  const id = (body as Record<string, unknown>).recipeId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestError('recipeId 값이 올바르지 않습니다');
  }
  return id;
};

export async function handleSimilar(req: Request, deps: SimilarDeps): Promise<Response> {
  try {
    const uid = await deps.getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    let recipeId: number;
    try {
      recipeId = await parseRecipeId(req);
    } catch (error) {
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }

    const [target, startDate] = await Promise.all([
      deps.fetchRecipe(recipeId),
      deps.getStartDate(uid),
    ]);
    if (!target) return json({ error: 'not found' }, 404);

    const week = programWeekOf(startDate, deps.now());
    const [registered, candidates] = await Promise.all([
      deps.getRegisteredIngredients(),
      deps.fetchCandidates(Math.min(week, MAX_SIMILAR_WEEK)),
    ]);
    const scored = scoreCandidates(target, candidates, buildIngredientNormalizer(registered));
    if (scored.length === 0) return json({ recipes: [] }, 200);

    // 동점 정렬(저장 수)에 필요한 후보만 저장 기록을 조회한다. 상위 n개 안에 들 수 있는 후보(동점 포함)를
    // 정렬하면 전체 정렬의 앞부분과 같다. 중복을 빼고 6개가 안 되면 n을 늘려 다음 후보까지 본다
    const totalCounts: Record<number, number> = {};
    const otherCounts: Record<number, number> = {};
    const savedAt = new Map<number, string>();
    const fetched = new Set<number>();
    let ids: number[] = [];
    for (let n = SIMILAR_COUNT; ; n += SIMILAR_COUNT) {
      const pool = contenders(scored, n);
      const newIds = pool.map((s) => s.id).filter((id) => !fetched.has(id));
      if (newIds.length > 0) {
        newIds.forEach((id) => fetched.add(id));
        for (const s of await deps.fetchSaves(newIds)) {
          totalCounts[s.recipe_id] = (totalCounts[s.recipe_id] ?? 0) + 1;
          if (s.uid === uid) savedAt.set(s.recipe_id, s.created_at);
          else otherCounts[s.recipe_id] = (otherCounts[s.recipe_id] ?? 0) + 1;
        }
      }
      ids = rankSimilar(pool, totalCounts, SIMILAR_COUNT);
      if (ids.length >= SIMILAR_COUNT || pool.length >= scored.length) break;
    }

    const cards = await deps.fetchCards(ids);
    const cardById = new Map(cards.map((c) => [c.id, c]));

    // 순위를 유지한다 (조회 사이에 지워진 레시피는 뺀다)
    const recipes: SimilarRecipe[] = ids.flatMap((id) => {
      const c = cardById.get(id);
      if (!c) return [];
      return [
        {
          ...c,
          is_saved: savedAt.has(id),
          saved_at: savedAt.get(id) ?? null,
          // 앱 카드는 saved_count + 내 저장 여부로 표시하므로 다른 유저 저장 수만
          saved_count: otherCounts[id] ?? 0,
        },
      ];
    });

    return json({ recipes }, 200);
  } catch (error) {
    console.error('비슷한 레시피 조회 실패:', error);
    return json({ error: '비슷한 레시피를 불러오지 못했어요' }, 500);
  }
}
