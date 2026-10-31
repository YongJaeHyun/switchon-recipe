// Gemini 실제 사용량 기록 (ai_usage 테이블, 20261101050000_pass_recipe_cap_and_ai_usage.sql).
// 운영자 결정 2026-11-01: 출시 뒤 실제 데이터로 패스 가격·원가를 다시 보려고 호출마다 토큰 수를 남긴다.
// 비용 계산 쿼리는 docs/ai-usage.md, DB 함수 ai_usage_cost.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.
//
// 흐름: 각 호출부는 장애 알림 fetch(providerAlert.ts)를 withAiUsage로 한 번 더 감싸 기능 이름과 uid를 붙인다.
// 재시도하는 호출부(process-ingredient-request)는 onFinalResponse로 observeAiUsage를 직접 부른다.
// - Gemini 응답이면 본문을 복제(clone)해 백그라운드에서 usageMetadata를 읽고 한 행을 넣는다. 호출부는 원래 응답을 그대로 읽는다
// - 실패 응답(4xx·5xx)은 본문을 읽지 않고 ok=false·0토큰으로 남긴다 (실패 호출 수를 보려고)
// - 기록은 유저 요청을 막거나 실패시키지 않는다: 오류는 삼키고 console.error만, 전체 5초 제한
// - 재시도 중간 응답(fetchWithRetry가 버린 429·5xx)과 응답 없이 끝난 호출(시간 초과)은 남지 않는다

import { modelOfUrl, providerOfUrl, withTimeout } from './providerAlert.ts';

// 기능 이름. 비용 쿼리가 이 이름으로 묶는다
export type AiUsageFeature =
  | 'recipe_text' // 레시피 텍스트 (재료로 만들기·이름으로 만들기 공통)
  | 'recipe_image' // 레시피 대표 이미지
  | 'recipe_name_check' // 이름으로 만들기: 이름 판정
  | 'food_check' // 먹어도 될까 판정
  | 'inbody_read' // 인바디 결과지 읽기
  | 'weekly_report' // 주간 리포트 (cron·패스 구매 뒤 보충)
  | 'report_on_demand' // 주간 리포트 직접 만들기·다시 만들기
  | 'recipe_tags' // 기존 레시피 태깅 백필
  | 'recipe_servings' // 기존 레시피 인분 추정 백필
  | 'ingredient_judge' // 재료 요청 판단
  | 'ingredient_image_check' // 재료 사진 검증
  | 'ingredient_image'; // 재료 이미지 생성

export interface AiUsageCounts {
  // 입력 토큰 (프롬프트 + 도구 사용 프롬프트)
  inputTokens: number;
  // 텍스트 출력 토큰 (이미지 토큰 제외, 생각 토큰 제외)
  outputTokens: number;
  // 생각 토큰 (출력 단가로 과금)
  thinkingTokens: number;
  // 이미지 출력 토큰 (candidatesTokensDetails의 IMAGE)
  imageTokens: number;
  // 응답에 들어 있는 이미지 장수 (이미지 모델은 장당 과금)
  imageCount: number;
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Gemini generateContent 응답 JSON에서 사용량을 뽑는다. 빠지거나 이상한 값은 0
export function extractAiUsage(json: unknown): AiUsageCounts {
  const body = asObject(json);
  const meta = asObject(body?.usageMetadata);

  const imageTokens = asArray(meta?.candidatesTokensDetails).reduce<number>((sum, detail) => {
    const d = asObject(detail);
    return d?.modality === 'IMAGE' ? sum + count(d.tokenCount) : sum;
  }, 0);

  const imageCount = asArray(body?.candidates).reduce<number>((sum, candidate) => {
    const parts = asArray(asObject(asObject(candidate)?.content)?.parts);
    return (
      sum +
      parts.filter((part) => {
        const inline = asObject(asObject(part)?.inlineData);
        return typeof inline?.mimeType === 'string' && inline.mimeType.startsWith('image/');
      }).length
    );
  }, 0);

  return {
    inputTokens: count(meta?.promptTokenCount) + count(meta?.toolUsePromptTokenCount),
    outputTokens: Math.max(count(meta?.candidatesTokenCount) - imageTokens, 0),
    thinkingTokens: count(meta?.thoughtsTokenCount),
    imageTokens,
    imageCount,
  };
}

// ai_usage 한 행 (id·created_at은 DB 기본값)
export interface AiUsageRow {
  uid: string | null;
  feature: AiUsageFeature;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  image_tokens: number;
  image_count: number;
  ok: boolean;
  status: number;
}

export type AiUsageInsert = (row: AiUsageRow) => Promise<void>;

// supabase-js 클라이언트 중 여기서 쓰는 부분만 (service role 클라이언트여야 한다. ai_usage는 정책 없음)
export interface AiUsageDbClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export const createAiUsageInsert =
  (client: AiUsageDbClient): AiUsageInsert =>
  async (row) => {
    const { error } = (await client.from('ai_usage').insert(row)) as {
      error: { message: string } | null;
    };
    if (error) throw new Error(`ai_usage 기록 실패: ${error.message}`);
  };

export interface AiUsageContext {
  // 기능 이름. 한 콜백이 여러 모델을 부르면 모델 이름(URL의 models/<모델>)으로 고른다
  feature: AiUsageFeature | ((model: string) => AiUsageFeature);
  // 요청한 유저. cron·백필은 null
  uid?: string | null;
}

type Schedule = (task: Promise<unknown>) => void;
type Log = (...args: unknown[]) => void;

// 기록 작업 전체(본문 읽기·insert) 제한. 응답을 돌려준 뒤에도 끝까지 돌게 waitUntil에 맡긴다
export const AI_USAGE_TASK_TIMEOUT_MS = 5000;

const runUsageInBackground: Schedule = (task) => {
  const guarded = withTimeout(task, AI_USAGE_TASK_TIMEOUT_MS).catch((error) =>
    console.error('[aiUsage] 사용량 기록 실패:', error)
  );
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  try {
    runtime?.waitUntil(guarded);
  } catch {
    // 요청 밖(waitUntil 불가)이면 그냥 백그라운드로 둔다
  }
};

// 외부 API 최종 응답 하나를 받아 Gemini면 ai_usage 한 행을 넣는다. 절대 던지지 않는다
export function observeAiUsage(
  insert: AiUsageInsert,
  context: AiUsageContext,
  schedule: Schedule = runUsageInBackground,
  log: Log = console.error
): (url: string, res: Response) => void {
  return (url, res) => {
    try {
      if (providerOfUrl(url) !== 'gemini') return;
      const model = modelOfUrl(url);
      const feature =
        typeof context.feature === 'function' ? context.feature(model) : context.feature;
      // 성공 응답만 본문을 읽는다. 호출부가 원래 응답을 읽을 수 있게 복제본을 읽는다
      const copy = res.ok ? res.clone() : null;
      schedule(
        (async () => {
          const usage = copy ? extractAiUsage(await copy.json().catch(() => null)) : null;
          await insert({
            uid: context.uid ?? null,
            feature,
            model,
            input_tokens: usage?.inputTokens ?? 0,
            output_tokens: usage?.outputTokens ?? 0,
            thinking_tokens: usage?.thinkingTokens ?? 0,
            image_tokens: usage?.imageTokens ?? 0,
            image_count: usage?.imageCount ?? 0,
            ok: res.ok,
            status: res.status,
          });
        })().catch((error) => log('[aiUsage] 사용량 기록 실패:', error))
      );
    } catch (error) {
      log('[aiUsage] 사용량 기록 준비 실패:', error);
    }
  };
}

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

// 응답마다 observer(observeAiUsage)를 부르는 fetch. 응답·예외는 그대로 돌려준다
export function withAiUsage(
  fetchFn: typeof fetch,
  observe: (url: string, res: Response) => void
): typeof fetch {
  const watched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await fetchFn(input, init);
    try {
      observe(urlOf(input), res);
    } catch (error) {
      console.error('[aiUsage] observer 실패:', error);
    }
    return res;
  };
  return watched as typeof fetch;
}

// 호출부용 한 줄: 장애 알림 fetch에 기능 이름·uid를 붙여 사용량도 남긴다
export const aiUsageFetch = (
  fetchFn: typeof fetch,
  client: AiUsageDbClient,
  context: AiUsageContext
): typeof fetch => withAiUsage(fetchFn, observeAiUsage(createAiUsageInsert(client), context));
