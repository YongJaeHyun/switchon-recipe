import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatAdBonusLeft,
  formatRemaining,
  getQuotaModalView,
  runAdBonusFlow,
  waitForAdBonus,
} from './recipeQuota';

describe('getQuotaModalView', () => {
  const features = ['편의점 판정', '맞춤 레시피 추천', 'AI 주간 리포트'];
  const base = {
    isPass: false,
    canWatchAd: true,
    adsAvailable: true,
    onSale: true,
    freeDaily: 3,
    adBonusLeft: 17,
    passDaily: 20,
    passFeatures: features,
  };
  const passSection = { lead: '광고 없이 하루 20개', features };

  it('무료 + 광고 가능 + 판매중 → 무료 개수 제목, 광고 버튼과 남은 광고 수, 패스 안내', () => {
    expect(getQuotaModalView(base)).toEqual({
      headline: '오늘 무료 레시피 3개를 다 썼어요',
      note: null,
      ad: { hint: '오늘 광고로 17개 더 만들 수 있어요' },
      pass: passSection,
    });
  });
  it('개수는 넘겨받은 설정값을 그대로 쓴다', () => {
    const view = getQuotaModalView({ ...base, freeDaily: 5, adBonusLeft: 2, passDaily: 30 });
    expect(view.headline).toBe('오늘 무료 레시피 5개를 다 썼어요');
    expect(view.ad?.hint).toBe('오늘 광고로 2개 더 만들 수 있어요');
    expect(view.pass?.lead).toBe('광고 없이 하루 30개');
  });
  it('개수를 아직 모르면 숫자 없이 보여준다', () => {
    const view = getQuotaModalView({
      ...base,
      freeDaily: null,
      adBonusLeft: null,
      passDaily: null,
    });
    expect(view.headline).toBe('오늘 무료 레시피를 다 썼어요');
    expect(view.ad).toEqual({ hint: null });
    expect(view.pass).toEqual({ lead: '광고 없이 더 많은 레시피', features });
  });
  it('남은 광고 수가 0이면 안내 문구를 숨긴다', () => {
    expect(getQuotaModalView({ ...base, adBonusLeft: 0 }).ad).toEqual({ hint: null });
  });
  it('광고를 다 봤으면 오늘은 여기까지 + 패스 안내', () => {
    expect(getQuotaModalView({ ...base, canWatchAd: false })).toEqual({
      headline: '오늘은 여기까지예요',
      note: '내일 다시 만들 수 있어요',
      ad: null,
      pass: passSection,
    });
  });
  it('광고를 쓸 수 없는 앱이면 오늘은 여기까지 + 패스 안내', () => {
    const view = getQuotaModalView({ ...base, adsAvailable: false });
    expect(view.headline).toBe('오늘은 여기까지예요');
    expect(view.ad).toBeNull();
    expect(view.pass).not.toBeNull();
  });
  it('패스를 팔지 않으면 패스 안내를 숨긴다', () => {
    const view = getQuotaModalView({ ...base, onSale: false });
    expect(view.ad).not.toBeNull();
    expect(view.pass).toBeNull();
  });
  it('광고도 패스도 없으면 오늘은 여기까지만', () => {
    expect(getQuotaModalView({ ...base, canWatchAd: false, onSale: false })).toEqual({
      headline: '오늘은 여기까지예요',
      note: '내일 다시 만들 수 있어요',
      ad: null,
      pass: null,
    });
  });
  it('패스 이용자는 판매 여부와 상관없이 오늘은 여기까지만', () => {
    expect(getQuotaModalView({ ...base, isPass: true })).toEqual({
      headline: '오늘은 여기까지예요',
      note: '내일 다시 만들 수 있어요',
      ad: null,
      pass: null,
    });
  });
});

describe('formatRemaining', () => {
  it('무료는 하루 무료 개수와 남은 개수를 함께 보여준다', () => {
    expect(formatRemaining({ isPass: false, remaining: 3, limit: 5 })).toBe(
      '오늘 무료 레시피 3/5개 남았어요'
    );
  });
  it('무료를 다 쓰면 자정에 다시 채워진다고 알려준다', () => {
    expect(formatRemaining({ isPass: false, remaining: 0, limit: 5 })).toBe(
      '오늘 무료 레시피를 모두 만들었어요 · 자정에 다시 채워져요'
    );
  });
  it('광고 보상을 받아도 최대 개수는 기본 한도로 고정한다', () => {
    expect(formatRemaining({ isPass: false, remaining: 1, limit: 6, dailyLimit: 5 })).toBe(
      '오늘 무료 레시피 1/5개 남았어요'
    );
  });
  it('패스 최대 개수도 기본 한도로 보여준다', () => {
    expect(formatRemaining({ isPass: true, remaining: 3, limit: 20, dailyLimit: 20 })).toBe(
      '오늘 3/20개 남았어요'
    );
  });
  it('패스는 넉넉할 때 숨긴다', () => {
    expect(formatRemaining({ isPass: true, remaining: 12, limit: 20 })).toBeNull();
  });
  it('패스도 다 쓰면 자정에 다시 채워진다고 알려준다', () => {
    expect(formatRemaining({ isPass: true, remaining: 0, limit: 20 })).toBe(
      '오늘 레시피를 모두 만들었어요 · 자정에 다시 채워져요'
    );
  });
  it('패스는 5개 이하로 남으면 보여준다', () => {
    expect(formatRemaining({ isPass: true, remaining: 4, limit: 20 })).toBe('오늘 4/20개 남았어요');
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
