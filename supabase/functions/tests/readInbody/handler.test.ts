import { describe, expect, it, vi } from 'vitest';
import {
  handleReadInbody,
  INBODY_DAILY_LIMIT,
  INBODY_QUOTA_EXCEEDED_MESSAGE,
  MAX_BODY_BYTES,
  type ReadInbodyDeps,
} from '../../read-inbody/handler.ts';
import type { UsageStore } from '../../read-inbody/usage.ts';

const UID = 'user-1';
// 2026-10-30 08:00 KST
const NOW = new Date('2026-10-29T23:00:00Z');

const memoryStore = (initial: number | null = null) => {
  let used = initial;
  const store: UsageStore & { value: () => number | null } = {
    ensure: vi.fn(async () => {
      if (used === null) used = 0;
    }),
    read: vi.fn(async () => used),
    swap: vi.fn(async (from: number, to: number) => {
      if (used !== from) return false;
      used = to;
      return true;
    }),
    value: () => used,
  };
  return store;
};

const geminiOk = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    weight_kg: 72.4,
    muscle_kg: 30.1,
    fat_kg: 18.6,
    measured_on: '2026-10-28',
    ...o,
  });

const makeDeps = (o: Partial<ReadInbodyDeps> = {}, store = memoryStore()) => {
  const deps: ReadInbodyDeps = {
    getUid: vi.fn(async () => UID),
    now: () => NOW,
    usageStore: vi.fn(() => store),
    askGemini: vi.fn(async () => geminiOk()),
    ...o,
  };
  return { deps, store };
};

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/read-inbody', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const photo = { imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg' };

describe('handleReadInbody', () => {
  it('로그인 정보가 없으면 401, 한도·Gemini 안 씀', async () => {
    const { deps, store } = makeDeps({ getUid: vi.fn(async () => null) });
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(401);
    expect(store.ensure).not.toHaveBeenCalled();
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('성공: 200 + 정규화한 값, 오늘(KST) 행에서 1 차감', async () => {
    const { deps, store } = makeDeps();
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'ok',
      result: { weight_kg: 72.4, muscle_kg: 30.1, fat_kg: 18.6, measured_on: '2026-10-28' },
    });
    expect(deps.usageStore).toHaveBeenCalledWith(UID, '2026-10-30');
    expect(store.value()).toBe(1);
    expect(deps.askGemini).toHaveBeenCalledWith(expect.stringContaining('체지방량'), photo);
  });

  it('data URL 접두사는 떼고 Gemini에 넘긴다', async () => {
    const { deps } = makeDeps();
    await handleReadInbody(req({ ...photo, imageBase64: 'data:image/jpeg;base64,aGVsbG8=' }), deps);
    expect(deps.askGemini).toHaveBeenCalledWith(expect.any(String), photo);
  });

  it('범위 밖·형식 오류 값은 null로 돌려준다', async () => {
    const { deps } = makeDeps({
      askGemini: vi.fn(async () =>
        geminiOk({ weight_kg: '72.4', muscle_kg: 300, fat_kg: '18%', measured_on: '2026-11-02' })
      ),
    });
    const res = await handleReadInbody(req(photo), deps);
    expect((await res.json()).result).toEqual({
      weight_kg: 72.4,
      muscle_kg: null,
      fat_kg: null,
      measured_on: null,
    });
  });

  it('결과지가 아니어서 전부 null이어도 200 (차감은 유지: Gemini 비용이 들었다)', async () => {
    const { deps, store } = makeDeps({
      askGemini: vi.fn(async () =>
        JSON.stringify({ weight_kg: null, muscle_kg: null, fat_kg: null, measured_on: null })
      ),
    });
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).result).toEqual({
      weight_kg: null,
      muscle_kg: null,
      fat_kg: null,
      measured_on: null,
    });
    expect(store.value()).toBe(1);
  });

  it(`하루 ${INBODY_DAILY_LIMIT}회를 넘으면 429, Gemini 호출 안 함`, async () => {
    const { deps } = makeDeps({}, memoryStore(INBODY_DAILY_LIMIT));
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      code: 'INBODY_QUOTA_EXCEEDED',
      error: INBODY_QUOTA_EXCEEDED_MESSAGE,
      remaining: 0,
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('Gemini 실패면 500 + 차감 되돌림', async () => {
    const { deps, store } = makeDeps({
      askGemini: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: '결과지를 읽지 못했어요. 잠시 후 다시 시도해 주세요',
    });
    expect(store.value()).toBe(0);
  });

  it('Gemini 응답이 JSON이 아니면 500 + 차감 되돌림', async () => {
    const { deps, store } = makeDeps({ askGemini: vi.fn(async () => 'not json') });
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(500);
    expect(store.value()).toBe(0);
  });

  it('한도 저장소가 실패하면 500, Gemini 호출 안 함', async () => {
    const store = memoryStore();
    store.ensure = vi.fn(async () => {
      throw new Error('db down');
    });
    const { deps } = makeDeps({}, store);
    const res = await handleReadInbody(req(photo), deps);
    expect(res.status).toBe(500);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON이 아님', 'nope'],
    ['사진 없음', { mimeType: 'image/jpeg' }],
    ['빈 사진', { imageBase64: '  ', mimeType: 'image/jpeg' }],
    ['지원하지 않는 형식', { imageBase64: 'aGVsbG8=', mimeType: 'image/gif' }],
  ])('잘못된 요청(%s)은 400, 차감 안 함', async (_, body) => {
    const { deps, store } = makeDeps();
    const res = await handleReadInbody(req(body), deps);
    expect(res.status).toBe(400);
    expect(store.ensure).not.toHaveBeenCalled();
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('본문이 너무 크면 413', async () => {
    const { deps } = makeDeps();
    const big = { imageBase64: 'a'.repeat(MAX_BODY_BYTES + 1), mimeType: 'image/jpeg' };
    const res = await handleReadInbody(req(big), deps);
    expect(res.status).toBe(413);
    expect(deps.askGemini).not.toHaveBeenCalled();
  });
});
