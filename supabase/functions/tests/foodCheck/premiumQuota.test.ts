import { describe, expect, it } from 'vitest';
import { parsePremiumQuota, PREMIUM_QUOTA_EXCEEDED_MESSAGE } from '../../_shared/premiumQuota.ts';

describe('parsePremiumQuota', () => {
  it('정상 응답은 그대로 통과한다', () => {
    expect(parsePremiumQuota({ allowed: true, remaining: 29, limit: 30 })).toEqual({
      allowed: true,
      remaining: 29,
      limit: 30,
    });
  });

  it('여분 필드는 버린다', () => {
    expect(parsePremiumQuota({ allowed: false, remaining: 0, limit: 30, extra: 1 })).toEqual({
      allowed: false,
      remaining: 0,
      limit: 30,
    });
  });

  it('null이면 던진다', () => {
    expect(() => parsePremiumQuota(null)).toThrow();
  });

  it('필드 타입이 어긋나면 던진다', () => {
    expect(() => parsePremiumQuota({ allowed: 'true', remaining: 1, limit: 30 })).toThrow();
    expect(() => parsePremiumQuota({ allowed: true, remaining: '1', limit: 30 })).toThrow();
    expect(() => parsePremiumQuota({ allowed: true, remaining: 1 })).toThrow();
  });

  it('초과 메시지 문구', () => {
    expect(PREMIUM_QUOTA_EXCEEDED_MESSAGE).toBe(
      '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요'
    );
  });
});
