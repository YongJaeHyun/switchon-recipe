// 구독 기능 하루 한도(consume_premium_quota) 응답 해석과 초과 문구.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export interface PremiumQuotaDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export const PREMIUM_QUOTA_EXCEEDED_MESSAGE = '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요';

// 모양이 어긋나면(널 또는 필드 타입 불일치) 429로 새지 않도록 던져서 500으로 처리되게 한다.
export function parsePremiumQuota(data: unknown): PremiumQuotaDecision {
  if (typeof data !== 'object' || data === null) {
    throw new Error('구독 기능 한도 응답 형식이 올바르지 않습니다');
  }

  const d = data as Record<string, unknown>;
  if (
    typeof d.allowed !== 'boolean' ||
    typeof d.remaining !== 'number' ||
    typeof d.limit !== 'number'
  ) {
    throw new Error('구독 기능 한도 응답 형식이 올바르지 않습니다');
  }

  return { allowed: d.allowed, remaining: d.remaining, limit: d.limit };
}
