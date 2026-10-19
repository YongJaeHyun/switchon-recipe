import { describe, expect, it, vi } from 'vitest';
import { createRecoveryRunner, RECOVERY_THROTTLE_MS } from './passRecovery';

const setup = (online = true) => {
  const state = { online, now: 0 };
  const run = vi.fn().mockResolvedValue(undefined);
  const trigger = createRecoveryRunner({
    isOnline: async () => state.online,
    now: () => state.now,
    run,
  });
  return { state, run, trigger };
};

describe('createRecoveryRunner', () => {
  it('uid가 없으면 실행하지 않는다', async () => {
    const { run, trigger } = setup();
    expect(await trigger('')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('오프라인 시작이면 건너뛰고, 온라인이 되면 다음 트리거에서 실행한다', async () => {
    const { state, run, trigger } = setup(false);
    expect(await trigger('uid-1')).toBe(false);
    expect(run).not.toHaveBeenCalled();

    state.online = true;
    state.now = 1000; // 스로틀 시간 안이어도 아직 실행한 적 없으므로 실행
    expect(await trigger('uid-1')).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('실행 후 스로틀 시간 안에는 다시 실행하지 않고, 지나면 다시 실행한다', async () => {
    const { state, run, trigger } = setup();
    expect(await trigger('uid-1')).toBe(true);

    state.now = RECOVERY_THROTTLE_MS - 1;
    expect(await trigger('uid-1')).toBe(false);

    state.now = RECOVERY_THROTTLE_MS;
    expect(await trigger('uid-1')).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('실행이 throw하면 완료로 보지 않고 다음 트리거에서 다시 실행한다', async () => {
    const { run, trigger } = setup();
    run.mockRejectedValueOnce(new Error('network'));

    await expect(trigger('uid-1')).rejects.toThrow('network');
    expect(await trigger('uid-1')).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('다른 uid로 바뀌면 스로틀과 무관하게 실행한다', async () => {
    const { run, trigger } = setup();
    await trigger('uid-1');
    expect(await trigger('uid-2')).toBe(true);
    expect(run).toHaveBeenNthCalledWith(2, 'uid-2');
  });

  it('실행 중에 겹친 트리거는 건너뛴다', async () => {
    const { run, trigger } = setup();
    let release!: () => void;
    run.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));

    const first = trigger('uid-1');
    await Promise.resolve();
    expect(await trigger('uid-1')).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
