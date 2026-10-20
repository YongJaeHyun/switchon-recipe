// 레시피 생성 하루 한도: consume/release 호출을 감싸는 순수 로직과 초과 응답 바디.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  isPass: boolean;
  canWatchAd: boolean;
}

export const QUOTA_EXCEEDED_MESSAGE = '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.';

// consume_recipe_quota rpc의 jsonb 응답이 기대한 모양인지 확인한다. 모양이 어긋나면(널 또는 필드
// 타입 불일치) false 양성(429)으로 새지 않도록 여기서 바로 던져 500으로 처리되게 한다.
export function parseQuotaDecision(data: unknown): QuotaDecision {
  if (typeof data !== 'object' || data === null) {
    throw new Error('레시피 한도 응답 형식이 올바르지 않습니다');
  }

  const d = data as Record<string, unknown>;

  if (
    typeof d.allowed !== 'boolean' ||
    typeof d.remaining !== 'number' ||
    typeof d.limit !== 'number' ||
    typeof d.isPass !== 'boolean' ||
    typeof d.canWatchAd !== 'boolean'
  ) {
    throw new Error('레시피 한도 응답 형식이 올바르지 않습니다');
  }

  return {
    allowed: d.allowed,
    remaining: d.remaining,
    limit: d.limit,
    isPass: d.isPass,
    canWatchAd: d.canWatchAd,
  };
}

export function quotaExceededBody(decision: QuotaDecision): {
  code: 'QUOTA_EXCEEDED';
  error: string;
  remaining: 0;
  canWatchAd: boolean;
  isPass: boolean;
} {
  return {
    code: 'QUOTA_EXCEEDED',
    error: QUOTA_EXCEEDED_MESSAGE,
    remaining: 0,
    canWatchAd: decision.canWatchAd,
    isPass: decision.isPass,
  };
}

// 한도를 차감(consume)하고 generate를 실행한다. 거절되면 generate를 실행하지 않고 decision을 돌려준다.
// generate가 실패하면 차감을 되돌리고(release) 같은 오류를 다시 던진다. release 자체가 실패해도
// 로그만 남기고 generate의 원래 오류를 그대로 던진다 (release 실패로 원인이 가려지면 안 되므로).
export async function runWithQuota<T>(
  deps: { consume: () => Promise<QuotaDecision>; release: () => Promise<void> },
  generate: () => Promise<T>
): Promise<{ status: 'ok'; value: T } | { status: 'exceeded'; decision: QuotaDecision }> {
  const decision = await deps.consume();

  if (!decision.allowed) {
    return { status: 'exceeded', decision };
  }

  try {
    const value = await generate();
    return { status: 'ok', value };
  } catch (generateError) {
    try {
      await deps.release();
    } catch (releaseError) {
      console.error('release_recipe_quota 실패:', releaseError);
    }
    throw generateError;
  }
}
