// 레시피 생성 요청 처리 흐름 (HTTP·한도). 실제 연결(supabase, Gemini, 이미지)은 createRecipe.ts가 deps로 넘긴다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.
// 흐름: 유저 확인 -> 하루 한도 차감(consume) -> 생성(generate) -> 생성 실패 시 한도 복구(release, runWithQuota).
// 한도 초과면 생성 없이 429, 그 밖의 오류는 500 { error: String(err) }.

import { type QuotaDecision, quotaExceededBody, runWithQuota } from './quota.ts';

export interface CreateRecipeBody {
  command: string;
  week: unknown;
  is_zero_carb: unknown;
}

export interface CreateRecipeDeps {
  getUserId(): Promise<string | null>;
  consume(uid: string): Promise<QuotaDecision>;
  release(uid: string): Promise<void>;
  generate(body: CreateRecipeBody): Promise<unknown>;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export async function handleCreateRecipeRequest(
  req: Request,
  deps: CreateRecipeDeps
): Promise<Response> {
  try {
    const { command, week, is_zero_carb } = await req.json();

    const uid = await deps.getUserId();
    if (!uid) throw new Error('로그인된 사용자 정보를 가져올 수 없습니다');

    const result = await runWithQuota(
      { consume: () => deps.consume(uid), release: () => deps.release(uid) },
      () => deps.generate({ command, week, is_zero_carb })
    );

    if (result.status === 'exceeded') {
      return new Response(JSON.stringify(quotaExceededBody(result.decision)), {
        headers: jsonHeaders,
        status: 429,
      });
    }

    // 한도 차감은 이미 확정됐다. 이 응답을 클라이언트가 받지 못하고 중단해도(abort) 생성 자체는
    // 서버에서 끝났으므로 차감은 되돌리지 않는다 (의도된 동작).
    return new Response(JSON.stringify(result.value), {
      headers: jsonHeaders,
      status: 200,
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({
        error: String(err),
      }),
      {
        headers: jsonHeaders,
        status: 500,
      }
    );
  }
}
