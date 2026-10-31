import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
const captureError = vi.fn();
vi.mock('utils/sendError', () => ({ captureError: (...args: unknown[]) => captureError(...args) }));

const { PassAPI } = await import('./PassAPI');

describe('PassAPI.extendForWeekRepeat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('새 시작일로 extend_pass_for_week_repeat를 부르고 새 만료일을 돌려준다', async () => {
    rpc.mockResolvedValue({ data: '2026-12-13T10:00:00+00:00', error: null });

    expect(await PassAPI.extendForWeekRepeat('2026-10-15')).toBe('2026-12-13T10:00:00+00:00');
    expect(rpc).toHaveBeenCalledWith('extend_pass_for_week_repeat', { p_new_start: '2026-10-15' });
  });

  it('늘리지 않았으면(null) null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await PassAPI.extendForWeekRepeat('2026-10-15')).toBeNull();
  });

  it('오류면 기록하고 throw (호출부가 한 주 더 하기와 분리해 처리)', async () => {
    const error = new Error('rpc failed');
    rpc.mockResolvedValue({ data: null, error });
    await expect(PassAPI.extendForWeekRepeat('2026-10-15')).rejects.toBe(error);
    expect(captureError).toHaveBeenCalledTimes(1);
  });
});
