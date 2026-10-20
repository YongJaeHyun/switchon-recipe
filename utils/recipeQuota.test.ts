import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatRemaining,
  getQuotaModalActions,
  runAdBonusFlow,
  waitForAdBonus,
} from './recipeQuota';

describe('getQuotaModalActions', () => {
  const base = { isPass: false, canWatchAd: true, onSale: true, adsAvailable: true };

  it('패스 이용자는 아무 동작도 없다', () => {
    expect(getQuotaModalActions({ ...base, isPass: true })).toEqual([]);
  });
  it('무료 + 광고 가능 + 판매중 → 광고, 패스', () => {
    expect(getQuotaModalActions(base)).toEqual(['watchAd', 'pass']);
  });
  it('광고 소진 → 패스만', () => {
    expect(getQuotaModalActions({ ...base, canWatchAd: false })).toEqual(['pass']);
  });
  it('광고 모듈 없음 → watchAd 제외', () => {
    expect(getQuotaModalActions({ ...base, adsAvailable: false })).toEqual(['pass']);
  });
  it('판매 안 함 → pass 제외', () => {
    expect(getQuotaModalActions({ ...base, onSale: false })).toEqual(['watchAd']);
  });
});

describe('formatRemaining', () => {
  it('무료 3 → 오늘 3개 남았어요', () => {
    expect(formatRemaining({ isPass: false, remaining: 3 })).toBe('오늘 3개 남았어요');
  });
  it('패스 12 → null', () => {
    expect(formatRemaining({ isPass: true, remaining: 12 })).toBeNull();
  });
  it('패스 4 → 오늘 4개 남았어요', () => {
    expect(formatRemaining({ isPass: true, remaining: 4 })).toBe('오늘 4개 남았어요');
  });
});

describe('waitForAdBonus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('3번째 조회에서 반영되면 true', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ remaining: 0 })
      .mockResolvedValueOnce({ remaining: 0 })
      .mockResolvedValueOnce({ remaining: 1 });
    const promise = waitForAdBonus(get, { tries: 5, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBe(true);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('끝까지 0이면 false', async () => {
    const get = vi.fn().mockResolvedValue({ remaining: 0 });
    const promise = waitForAdBonus(get, { tries: 3, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBe(false);
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe('runAdBonusFlow', () => {
  const makeDeps = (over: Partial<Parameters<typeof runAdBonusFlow>[0]> = {}) => {
    const log: string[] = [];
    const deps = {
      showAd: vi.fn(async () => 'earned' as const),
      waitBonus: vi.fn(async () => true),
      retry: vi.fn(async () => {
        log.push('retry');
      }),
      isMounted: vi.fn(() => true),
      onWaiting: vi.fn((w: boolean) => {
        log.push(`waiting:${w}`);
      }),
      ...over,
    };
    return { deps, log };
  };

  it('광고를 끝까지 안 보면 대기 표시도 재시도도 없다', async () => {
    const { deps } = makeDeps({ showAd: vi.fn(async () => 'closed' as const) });
    expect(await runAdBonusFlow(deps)).toBe('closed');
    expect(deps.onWaiting).not.toHaveBeenCalled();
    expect(deps.retry).not.toHaveBeenCalled();
  });

  it('보상 확인이 늦으면 재시도하지 않고 대기 표시도 스스로 풀지 않는다', async () => {
    const { deps } = makeDeps({ waitBonus: vi.fn(async () => false) });
    expect(await runAdBonusFlow(deps)).toBe('delayed');
    expect(deps.retry).not.toHaveBeenCalled();
    expect(deps.onWaiting).toHaveBeenCalledTimes(1);
    expect(deps.onWaiting).toHaveBeenCalledWith(true);
  });

  it('화면이 사라졌으면 재시도하지 않는다', async () => {
    const { deps } = makeDeps({ isMounted: vi.fn(() => false) });
    expect(await runAdBonusFlow(deps)).toBe('unmounted');
    expect(deps.retry).not.toHaveBeenCalled();
  });

  it('재시도가 시작된 뒤에야 대기 표시를 푼다 (생성 버튼이 다시 눌리는 틈 방지)', async () => {
    let finishRetry!: () => void;
    const log: string[] = [];
    const { deps } = makeDeps({
      retry: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            log.push('retry');
            finishRetry = resolve;
          })
      ),
      onWaiting: vi.fn((w: boolean) => {
        log.push(`waiting:${w}`);
      }),
    });

    const flow = runAdBonusFlow(deps);
    await vi.waitFor(() => expect(log).toContain('waiting:false'));
    expect(log).toEqual(['waiting:true', 'retry', 'waiting:false']);

    let settled = false;
    void flow.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false); // 재시도가 끝나기 전

    finishRetry();
    expect(await flow).toBe('retried');
  });
});
