import { describe, expect, it, vi } from 'vitest';
import {
  parseQuotaDecision,
  QUOTA_EXCEEDED_MESSAGE,
  quotaExceededBody,
  runWithQuota,
  type QuotaDecision,
} from '../../_shared/quota.ts';

const allowedDecision: QuotaDecision = {
  allowed: true,
  remaining: 4,
  limit: 5,
  isPass: false,
  canWatchAd: true,
};

const exceededDecision: QuotaDecision = {
  allowed: false,
  remaining: 0,
  limit: 5,
  isPass: false,
  canWatchAd: true,
};

describe('runWithQuota', () => {
  it('허용되면 generate를 실행하고 release는 호출하지 않는다', async () => {
    const consume = vi.fn().mockResolvedValue(allowedDecision);
    const release = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue('recipe');

    const result = await runWithQuota({ consume, release }, generate);

    expect(result).toEqual({ status: 'ok', value: 'recipe' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
  });

  it('거절되면 generate를 실행하지 않고 decision을 돌려준다', async () => {
    const consume = vi.fn().mockResolvedValue(exceededDecision);
    const release = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue('recipe');

    const result = await runWithQuota({ consume, release }, generate);

    expect(result).toEqual({ status: 'exceeded', decision: exceededDecision });
    expect(generate).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('generate가 실패하면 release를 한 번 호출하고 같은 오류를 던진다', async () => {
    const consume = vi.fn().mockResolvedValue(allowedDecision);
    const release = vi.fn().mockResolvedValue(undefined);
    const generateError = new Error('생성 실패');
    const generate = vi.fn().mockRejectedValue(generateError);

    await expect(runWithQuota({ consume, release }, generate)).rejects.toThrow(generateError);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('generate와 release가 모두 실패하면 원래 generate 오류를 던진다', async () => {
    const consume = vi.fn().mockResolvedValue(allowedDecision);
    const generateError = new Error('생성 실패');
    const releaseError = new Error('복구 실패');
    const release = vi.fn().mockRejectedValue(releaseError);
    const generate = vi.fn().mockRejectedValue(generateError);

    await expect(runWithQuota({ consume, release }, generate)).rejects.toThrow(generateError);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('parseQuotaDecision', () => {
  it('유효한 입력이면 QuotaDecision을 그대로 돌려준다', () => {
    const data = {
      allowed: true,
      remaining: 4,
      limit: 5,
      isPass: false,
      canWatchAd: true,
    };

    expect(parseQuotaDecision(data)).toEqual(data);
  });

  it('null이면 던진다', () => {
    expect(() => parseQuotaDecision(null)).toThrow();
  });

  it('allowed가 boolean이 아니면 던진다', () => {
    expect(() =>
      parseQuotaDecision({
        allowed: 'yes',
        remaining: 4,
        limit: 5,
        isPass: false,
        canWatchAd: true,
      })
    ).toThrow();
  });
});

describe('quotaExceededBody', () => {
  it('전역 제약의 본문과 정확히 같다', () => {
    const decision: QuotaDecision = {
      allowed: false,
      remaining: 0,
      limit: 5,
      isPass: true,
      canWatchAd: false,
    };

    expect(quotaExceededBody(decision)).toEqual({
      code: 'QUOTA_EXCEEDED',
      error: '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.',
      remaining: 0,
      canWatchAd: false,
      isPass: true,
    });
    expect(quotaExceededBody(decision).error).toBe(QUOTA_EXCEEDED_MESSAGE);
  });
});
