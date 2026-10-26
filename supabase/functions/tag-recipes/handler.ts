// 기존 레시피 태깅(백필) 처리 본체. 외부 의존성(DB, Gemini)은 deps로 받아 Vitest(node)에서
// 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts).
// spicy가 null인 레시피를 id 순으로 커서(afterId) 다음부터 최대 50개 가져와 10개씩 동시에 Gemini로
// 태깅하고, 검증을 통과한 것만 update한다. 응답 { tagged, failed, remaining, lastId }.
// 다음 호출에 afterId = lastId를 넘기면 계속 진행하고, 실패해서 남은 레시피는 커서를 처음(afterId 없음)부터
// 다시 돌리면 재시도된다.

import {
  buildRecipeTagBatchPrompt,
  parseRecipeTagBatchResponse,
  recipeTagInputOf,
  type RecipeTags,
} from '../_shared/recipeTags.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';

export const MAX_ROWS = 50;
export const BATCH_SIZE = 10;

export interface TagSourceRow {
  id: number;
  recipe_name: string | null;
  ingredients: string | null;
  cooking_steps: string | null;
}

export interface TagRecipesDeps {
  // spicy가 null이고 id > afterId(없으면 전체)인 레시피를 id 오름차순으로 limit개
  fetchUntagged(afterId: number | null, limit: number): Promise<TagSourceRow[]>;
  // Gemini 응답 텍스트. 실패하면 던진다
  askGemini(prompt: string): Promise<string>;
  // 실패하면 던진다
  updateTags(id: number, tags: RecipeTags): Promise<void>;
  // 실행 뒤 spicy가 null인 레시피 수
  countRemaining(): Promise<number>;
}

export interface TagResult {
  tagged: number;
  failed: number;
  remaining: number;
  lastId: number | null;
}

const tagBatch = async (
  deps: TagRecipesDeps,
  rows: TagSourceRow[]
): Promise<{ tagged: number; failed: number }> => {
  const batch = rows.map(recipeTagInputOf);
  const ids = batch.map((r) => r.id);

  let results;
  try {
    results = parseRecipeTagBatchResponse(
      await deps.askGemini(buildRecipeTagBatchPrompt(batch)),
      ids
    );
  } catch (error) {
    console.error(`태깅 Gemini 실패 (${ids.join(',')}):`, error);
    return { tagged: 0, failed: batch.length };
  }

  let tagged = 0;
  let failed = batch.length - results.length;
  for (const { id, tags } of results) {
    try {
      await deps.updateTags(id, tags);
      tagged += 1;
    } catch (error) {
      console.error(`태그 저장 실패 (${id}):`, error);
      failed += 1;
    }
  }
  return { tagged, failed };
};

export async function runTagging(deps: TagRecipesDeps, afterId: number | null): Promise<TagResult> {
  const rows = await deps.fetchUntagged(afterId, MAX_ROWS);
  const batches: TagSourceRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  const outcomes = await Promise.all(batches.map((b) => tagBatch(deps, b)));
  const lastId = rows.reduce<number | null>(
    (max, r) => (max === null || r.id > max ? r.id : max),
    afterId
  );
  return {
    tagged: outcomes.reduce((n, o) => n + o.tagged, 0),
    failed: outcomes.reduce((n, o) => n + o.failed, 0),
    remaining: await deps.countRemaining(),
    lastId,
  };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

class BadRequestError extends Error {}

// 본문 { afterId?: 0 이상 정수 }. 본문이 없으면 처음부터
const readAfterId = async (req: Request): Promise<number | null> => {
  const text = await req.text();
  if (!text.trim()) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequestError('본문이 JSON이 아닙니다');
  }
  if (typeof body !== 'object' || body === null) throw new BadRequestError('잘못된 요청입니다');
  const afterId = (body as { afterId?: unknown }).afterId;
  if (afterId === undefined || afterId === null) return null;
  if (typeof afterId !== 'number' || !Number.isInteger(afterId) || afterId < 0) {
    throw new BadRequestError('afterId는 0 이상 정수여야 합니다');
  }
  return afterId;
};

export async function handleTagRecipes(req: Request, deps: TagRecipesDeps): Promise<Response> {
  try {
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }
    let afterId: number | null;
    try {
      afterId = await readAfterId(req);
    } catch (error) {
      if (error instanceof BadRequestError) return json({ error: error.message }, 400);
      throw error;
    }
    return json(await runTagging(deps, afterId), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('레시피 태깅 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
