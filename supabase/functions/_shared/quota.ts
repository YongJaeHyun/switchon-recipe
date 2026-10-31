// 레시피 생성 하루 한도: consume/release 호출을 감싸는 순수 로직과 초과 응답 바디.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export interface QuotaDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  isPass: boolean;
  canWatchAd: boolean;
  // 패스가 있어도 이번 패스 레시피 총량을 다 써서 무료 이용자처럼 센 경우만 true (isPass는 false).
  // 20261101050000 마이그레이션 전 응답에는 없다 (그때는 필드를 빼고 돌려준다)
  passCapReached?: boolean;
  // 이번 패스 기간 레시피 총량 (passRecipeCap.ts). 패스가 없거나 모르면 없음
  passTotalLimit?: number;
}

export const QUOTA_EXCEEDED_MESSAGE = '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.';

// 패스 총량을 다 쓴 경우의 안내. 5.x 앱은 error 문구를 보여주지 않고 isPass·canWatchAd로 창을 고른다
export const passCapReachedMessage = (totalLimit: number | null | undefined) =>
  typeof totalLimit === 'number'
    ? `이번 패스로 만들 수 있는 레시피 ${totalLimit}개를 모두 만들었어요.`
    : '이번 패스로 만들 수 있는 레시피를 모두 만들었어요.';

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
    ...(typeof d.passCapReached === 'boolean' ? { passCapReached: d.passCapReached } : {}),
    ...(typeof d.passTotalLimit === 'number' ? { passTotalLimit: d.passTotalLimit } : {}),
  };
}

// 429 본문. 기존 필드는 그대로 두고(5.x 앱 호환), 패스 총량을 다 쓴 경우에만 passCapReached·passTotalLimit을 더한다
export function quotaExceededBody(decision: QuotaDecision): {
  code: 'QUOTA_EXCEEDED';
  error: string;
  remaining: 0;
  canWatchAd: boolean;
  isPass: boolean;
  passCapReached?: true;
  passTotalLimit?: number;
} {
  const base = {
    code: 'QUOTA_EXCEEDED' as const,
    error: QUOTA_EXCEEDED_MESSAGE,
    remaining: 0 as const,
    canWatchAd: decision.canWatchAd,
    isPass: decision.isPass,
  };
  if (!decision.passCapReached) return base;
  return {
    ...base,
    error: passCapReachedMessage(decision.passTotalLimit),
    passCapReached: true,
    ...(decision.passTotalLimit !== undefined ? { passTotalLimit: decision.passTotalLimit } : {}),
  };
}

// 한도를 차감(consume)하고 generate를 실행한다. 거절되면 generate를 실행하지 않고 decision을 돌려준다.
// generate가 실패하면 차감을 되돌리고(release) 같은 오류를 다시 던진다. release 자체가 실패해도
// 로그만 남기고 generate의 원래 오류를 그대로 던진다 (release 실패로 원인이 가려지면 안 되므로).
// decision 타입은 allowed만 보고 판단하므로 제네릭으로 둔다 (레시피 QuotaDecision, 구독 기능
// PremiumQuotaDecision 모두 사용). 기본값은 기존 레시피 호출부와 같은 QuotaDecision.
export async function runWithQuota<T, D extends { allowed: boolean } = QuotaDecision>(
  deps: { consume: () => Promise<D>; release: () => Promise<void> },
  generate: () => Promise<T>
): Promise<{ status: 'ok'; value: T } | { status: 'exceeded'; decision: D }> {
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
      console.error('quota release 실패:', releaseError);
    }
    throw generateError;
  }
}
