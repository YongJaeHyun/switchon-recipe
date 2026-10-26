// 레시피 검색용 재료 태그(recipe.ingredient_tags) 다시 계산. 외부 의존성(DB)은 deps로 받아 Vitest(node)에서
// 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// 등록 재료(ingredient, is_active)를 읽고 레시피를 id 순으로 PAGE_SIZE개씩 읽어, 계산한 태그가 저장값과
// 다른 행만 update한다 (planIngredientTagUpdates). 다시 돌려도 안전하다.
// 호출: ingredient 변경 트리거·매일 cron(본문 없음/{} → 전체), { recipeIds: [..] } → 그 레시피만,
// { dryRun: true } → 바꾸지 않고 바뀔 행 수와 예시만.

import type { RegisteredIngredient } from '../_shared/ingredientNormalize.ts';
import {
  buildIngredientTagMatcher,
  planIngredientTagUpdates,
  type TagBackfillRow,
  type TagUpdate,
} from '../_shared/recipeIngredientTags.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';

export const PAGE_SIZE = 500;
const UPDATE_CONCURRENCY = 10;
const SAMPLE_COUNT = 10;

export interface RefreshTagsDeps {
  // is_active 등록 재료 전부. 실패하면 던진다
  fetchRegistered(): Promise<RegisteredIngredient[]>;
  // id > afterId(없으면 처음부터)인 레시피를 id 오름차순으로 limit개. ids가 있으면 그 id 중에서만
  fetchRecipes(afterId: number | null, limit: number, ids?: number[]): Promise<TagBackfillRow[]>;
  // 실패하면 던진다
  updateTags(id: number, tags: string[]): Promise<void>;
}

export interface RefreshOptions {
  recipeIds?: number[];
  dryRun?: boolean;
}

export interface RefreshResult {
  scanned: number;
  updated: number;
  failed: number[];
  samples?: TagUpdate[];
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// ids(있으면)의 레시피를 id 커서로 페이지 단위로 넘겨 가며 onPage에 준다
const forEachRecipePage = async (
  deps: RefreshTagsDeps,
  ids: number[] | undefined,
  onPage: (rows: TagBackfillRow[]) => Promise<void>
) => {
  const groups = ids ? chunk(ids, PAGE_SIZE) : [undefined];
  for (const group of groups) {
    let afterId: number | null = null;
    for (;;) {
      const rows = await deps.fetchRecipes(afterId, PAGE_SIZE, group);
      if (rows.length > 0) await onPage(rows);
      if (rows.length < PAGE_SIZE) break;
      afterId = rows.reduce((max, r) => (r.id > max ? r.id : max), rows[0].id);
    }
  }
};

export async function refreshIngredientTags(
  deps: RefreshTagsDeps,
  opts: RefreshOptions
): Promise<RefreshResult> {
  const ids = opts.recipeIds ? [...new Set(opts.recipeIds)].sort((a, b) => a - b) : undefined;
  if (ids && ids.length === 0) return { scanned: 0, updated: 0, failed: [] };

  const registered = await deps.fetchRegistered();
  // 등록 재료를 못 읽은 것과 같으므로 모든 태그를 지우지 않게 멈춘다
  if (registered.length === 0) throw new Error('등록 재료가 0개입니다. 중단합니다.');
  const matcher = buildIngredientTagMatcher(registered);

  let scanned = 0;
  let updated = 0;
  const failed: number[] = [];
  const samples: TagUpdate[] = [];

  await forEachRecipePage(deps, ids, async (rows) => {
    scanned += rows.length;
    const updates = planIngredientTagUpdates(rows, matcher);
    if (opts.dryRun) {
      updated += updates.length;
      samples.push(...updates.slice(0, SAMPLE_COUNT - samples.length));
      return;
    }
    for (const batch of chunk(updates, UPDATE_CONCURRENCY)) {
      await Promise.all(
        batch.map(async (u) => {
          try {
            await deps.updateTags(u.id, u.tags);
            updated += 1;
          } catch (error) {
            console.error(`재료 태그 저장 실패 (${u.id}):`, error);
            failed.push(u.id);
          }
        })
      );
    }
  });

  failed.sort((a, b) => a - b);
  return opts.dryRun ? { scanned, updated, failed, samples } : { scanned, updated, failed };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

class BadRequestError extends Error {}

// 본문 { recipeIds?: 양의 정수[], dryRun?: boolean }. 본문이 없거나 {}이면 전체
const readOptions = async (req: Request): Promise<RefreshOptions> => {
  const text = await req.text();
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequestError('본문이 JSON이 아닙니다');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestError('잘못된 요청입니다');
  }
  const { recipeIds, dryRun } = body as { recipeIds?: unknown; dryRun?: unknown };
  const opts: RefreshOptions = {};
  if (recipeIds !== undefined && recipeIds !== null) {
    if (
      !Array.isArray(recipeIds) ||
      !recipeIds.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)
    ) {
      throw new BadRequestError('recipeIds는 양의 정수 배열이어야 합니다');
    }
    opts.recipeIds = recipeIds as number[];
  }
  if (dryRun !== undefined && dryRun !== null) {
    if (typeof dryRun !== 'boolean') throw new BadRequestError('dryRun은 boolean이어야 합니다');
    opts.dryRun = dryRun;
  }
  return opts;
};

export async function handleRefreshIngredientTags(
  req: Request,
  deps: RefreshTagsDeps
): Promise<Response> {
  try {
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }
    let opts: RefreshOptions;
    try {
      opts = await readOptions(req);
    } catch (error) {
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }
    return json(await refreshIngredientTags(deps, opts), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('재료 태그 갱신 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
