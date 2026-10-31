// 기존 레시피 기준 인분 추정(백필) 처리 본체. 외부 의존성(DB, Gemini)은 deps로 받아 Vitest(node)에서
// 가짜로 테스트한다. URL import를 두지 않는다 (실제 연결은 index.ts). tag-recipes와 같은 방식이다.
// servings가 null인 레시피를 id 순으로 커서(afterId) 다음부터 최대 50개 가져와 10개씩 동시에 Gemini로
// 추정하고, 1~8 정수만 update한다. 응답 { estimated, failed, remaining, lastId }.
// 다음 호출에 afterId = lastId를 넘기면 계속 진행하고, 실패해서 남은 레시피(null 그대로)는 커서를
// 처음(afterId 없음)부터 다시 돌리면 재시도된다.

import {
  buildServingsBatchPrompt,
  parseServingsBatchResponse,
  servingsInputOf,
} from '../_shared/recipeServings.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';

export const MAX_ROWS = 50;
export const BATCH_SIZE = 10;

export interface ServingsSourceRow {
  id: number;
  recipe_name: string | null;
  ingredients: string | null;
  cooking_steps: string | null;
}

export interface EstimateServingsDeps {
  // servings가 null이고 id > afterId(없으면 전체)인 레시피를 id 오름차순으로 limit개
  fetchMissing(afterId: number | null, limit: number): Promise<ServingsSourceRow[]>;
  // Gemini 응답 텍스트. 실패하면 던진다
  askGemini(prompt: string): Promise<string>;
  // 실패하면 던진다
  updateServings(id: number, servings: number): Promise<void>;
  // 실행 뒤 servings가 null인 레시피 수
  countRemaining(): Promise<number>;
}

export interface EstimateResult {
  estimated: number;
  failed: number;
  remaining: number;
  lastId: number | null;
}

const estimateBatch = async (
  deps: EstimateServingsDeps,
  rows: ServingsSourceRow[]
): Promise<{ estimated: number; failed: number }> => {
  const batch = rows.map(servingsInputOf);
  const ids = batch.map((r) => r.id);

  let results;
  try {
    results = parseServingsBatchResponse(
      await deps.askGemini(buildServingsBatchPrompt(batch)),
      ids
    );
  } catch (error) {
    console.error(`인분 추정 Gemini 실패 (${ids.join(',')}):`, error);
    return { estimated: 0, failed: batch.length };
  }

  let estimated = 0;
  let failed = batch.length - results.length;
  for (const { id, servings } of results) {
    try {
      await deps.updateServings(id, servings);
      estimated += 1;
    } catch (error) {
      console.error(`인분 저장 실패 (${id}):`, error);
      failed += 1;
    }
  }
  return { estimated, failed };
};

export async function runEstimation(
  deps: EstimateServingsDeps,
  afterId: number | null
): Promise<EstimateResult> {
  const rows = await deps.fetchMissing(afterId, MAX_ROWS);
  const batches: ServingsSourceRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  const outcomes = await Promise.all(batches.map((b) => estimateBatch(deps, b)));
  const lastId = rows.reduce<number | null>(
    (max, r) => (max === null || r.id > max ? r.id : max),
    afterId
  );
  return {
    estimated: outcomes.reduce((n, o) => n + o.estimated, 0),
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

export async function handleEstimateServings(
  req: Request,
  deps: EstimateServingsDeps
): Promise<Response> {
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
    return json(await runEstimation(deps, afterId), 200);
  } catch (error) {
    // 오류 상세는 로그에만 남긴다
    console.error('레시피 인분 추정 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
}
