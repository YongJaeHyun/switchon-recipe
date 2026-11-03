import { describe, expect, it, vi } from 'vitest';
import { describeFunctionsError, invokeWithAuthRetry } from './functionsInvoke';

// supabase-js FunctionsHttpError 모양: name + context(Response)
const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(body), { status }),
});

describe('invokeWithAuthRetry', () => {
  it('401이면 로그인 토큰을 새로 받고 한 번만 다시 부른다', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: httpError(401, { error: 'unauthorized' }) })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(invokeWithAuthRetry(call, refresh)).resolves.toEqual({
      data: { ok: true },
      error: null,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('다시 불러도 401이면 그 결과를 그대로 돌려준다 (더 반복하지 않음)', async () => {
    const second = { data: null, error: httpError(401, {}) };
    const call = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: httpError(401, {}) })
      .mockResolvedValueOnce(second);
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(invokeWithAuthRetry(call, refresh)).resolves.toBe(second);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('401이 아닌 실패나 성공은 다시 부르지 않는다', async () => {
    for (const result of [
      { data: null, error: httpError(500, {}) },
      { data: { ok: true }, error: null },
    ]) {
      const call = vi.fn().mockResolvedValue(result);
      const refresh = vi.fn();
      await expect(invokeWithAuthRetry(call, refresh)).resolves.toBe(result);
      expect(call).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it('토큰 새로 받기가 실패해도 처음 결과를 돌려준다', async () => {
    const first = { data: null, error: httpError(401, {}) };
    const call = vi.fn().mockResolvedValue(first);
    const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'));

    await expect(invokeWithAuthRetry(call, refresh)).resolves.toBe(first);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('describeFunctionsError', () => {
  it('함수 이름·상태 코드·응답 본문을 메시지에 담는다', async () => {
    const error = await describeFunctionsError(
      'get-pass-status',
      httpError(401, { error: 'unauthorized' })
    );
    expect((error as Error).message).toBe('get-pass-status 401: {"error":"unauthorized"}');
  });

  it('HTTP 오류가 아니면 원래 오류를 그대로 둔다', async () => {
    const original = new Error('boom');
    await expect(describeFunctionsError('get-pass-status', original)).resolves.toBe(original);
  });

  it('본문을 못 읽으면 상태 코드만', async () => {
    const error = await describeFunctionsError('verify-pass-purchase', {
      name: 'FunctionsHttpError',
      context: {
        status: 503,
        text: () => Promise.reject(new Error('used')),
      },
    });
    expect((error as Error).message).toBe('verify-pass-purchase 503');
  });
});
