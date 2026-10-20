import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatAdBonusLeft,
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
  it('무료는 하루 무료 개수와 남은 개수를 함께 보여준다', () => {
    expect(formatRemaining({ isPass: false, remaining: 3, limit: 5 })).toBe(
      '오늘 무료 레시피 3/5개 남았어요'
    );
  });
  it('무료는 다 써도 표시한다', () => {
    expect(formatRemaining({ isPass: false, remaining: 0, limit: 5 })).toBe(
      '오늘 무료 레시피 0/5개 남았어요'
    );
  });
  it('광고 보상을 받으면 늘어난 한도로 보여준다', () => {
    expect(formatRemaining({ isPass: false, remaining: 1, limit: 6 })).toBe(
      '오늘 무료 레시피 1/6개 남았어요'
    );
  });
  it('패스는 넉넉할 때 숨긴다', () => {
    expect(formatRemaining({ isPass: true, remaining: 12, limit: 20 })).toBeNull();
  });
  it('패스는 5개 이하로 남으면 보여준다', () => {
    expect(formatRemaining({ isPass: true, remaining: 4, limit: 20 })).toBe(
      '오늘 4/20개 남았어요'
    );
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

describe('formatAdBonusLeft', () => {
  const base = { isPass: false, adBonusLeft: 3 };

  it('무료 이용자에게 남은 광고 보상 횟수를 알려준다', () => {
    expect(formatAdBonusLeft(base, true)).toBe('광고 보고 3개 더 만들 수 있어요');
  });

  it('광고 보상을 다 썼으면 표시하지 않는다', () => {
    expect(formatAdBonusLeft({ ...base, adBonusLeft: 0 }, true)).toBeNull();
  });

  it('패스 이용자에게는 표시하지 않는다', () => {
    expect(formatAdBonusLeft({ ...base, isPass: true }, true)).toBeNull();
  });

  it('광고를 쓸 수 없는 앱에서는 표시하지 않는다', () => {
    expect(formatAdBonusLeft(base, false)).toBeNull();
  });
});
