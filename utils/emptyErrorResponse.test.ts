import { describe, expect, it } from 'vitest';
import { fillEmptyErrorResponse, isTransientServerError } from './emptyErrorResponse';

describe('fillEmptyErrorResponse', () => {
  it('본문이 빈 실패 응답에 상태 코드를 채워 넣는다', async () => {
    const res = await fillEmptyErrorResponse(new Response('', { status: 503, statusText: 'x' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: 'HTTP_503',
      message: 'HTTP 503 (빈 응답)',
      details: null,
      hint: null,
    });
  });

  it('본문이 있는 실패 응답과 성공 응답은 그대로 둔다', async () => {
    const withBody = new Response('{"code":"42P01","message":"x"}', { status: 400 });
    expect(await fillEmptyErrorResponse(withBody)).toBe(withBody);
    const ok = new Response('', { status: 200 });
    expect(await fillEmptyErrorResponse(ok)).toBe(ok);
  });

  it('본문이 빈 404는 그대로 둔다 (라이브러리가 204로 다룬다)', async () => {
    const notFound = new Response('', { status: 404 });
    expect((await fillEmptyErrorResponse(notFound)).status).toBe(404);
    expect(await (await fillEmptyErrorResponse(new Response('', { status: 404 }))).text()).toBe('');
  });
});

describe('isTransientServerError', () => {
  it('빈 5xx 응답으로 채운 오류만 일시적인 서버 문제로 본다', () => {
    expect(isTransientServerError({ code: 'HTTP_503', message: 'HTTP 503 (빈 응답)' })).toBe(true);
    expect(isTransientServerError({ code: 'HTTP_502' })).toBe(true);
    expect(isTransientServerError({ code: 'HTTP_401' })).toBe(false);
    expect(isTransientServerError({ code: '42P01', message: 'x' })).toBe(false);
    expect(isTransientServerError(new Error('boom'))).toBe(false);
    expect(isTransientServerError(null)).toBe(false);
  });
});
