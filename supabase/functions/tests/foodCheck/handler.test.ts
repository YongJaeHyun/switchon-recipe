import { describe, expect, it, vi } from 'vitest';
import {
  type FoodCheckDeps,
  type FoodCheckInsert,
  type FoodCheckRow,
  handleFoodCheck,
  MAX_BODY_BYTES,
} from '../../food-check/handler.ts';
import { PREMIUM_QUOTA_EXCEEDED_MESSAGE } from '../../_shared/premiumQuota.ts';

const UID = 'user-1';

const geminiOk = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    recognized: true,
    productName: '훈제 닭가슴살',
    score: 8,
    reasons: ['단백질이 많아요'],
    alternatives: [],
    ...o,
  });

const makeDeps = (o: Partial<FoodCheckDeps> = {}) => {
  let nextId = 100;
  const deps: FoodCheckDeps = {
    getUid: vi.fn(async () => UID),
    premiumClient: { rpc: vi.fn(async () => ({ data: true, error: null })) },
    consume: vi.fn(async () => ({ allowed: true, remaining: 29, limit: 30 })),
    release: vi.fn(async () => undefined),
    getStartDate: vi.fn(async () => '2026-10-01'),
    now: () => new Date('2026-10-20T03:00:00Z'),
    askGemini: vi.fn(async () => geminiOk()),
    insertCheck: vi.fn(
      async (row: FoodCheckInsert): Promise<FoodCheckRow> => ({
        ...row,
        id: nextId++,
        image_path: null,
        thumb_path: null,
        created_at: '2026-10-20T03:00:01.000Z',
      })
    ),
    storeImages: vi.fn(async (uid: string, id: number) => ({
      imagePath: `${uid}/${id}.jpg`,
      thumbPath: `${uid}/${id}_thumb.jpg`,
    })),
    updateImagePaths: vi.fn(async () => undefined),
    deleteCheck: vi.fn(async () => undefined),
    signThumbUrl: vi.fn(async (path: string) => `https://signed/${path}`),
    ...o,
  };
  return deps;
};

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/food-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const textBody = { type: 'text', text: '훈제 닭가슴살' };
const photoBody = { type: 'front', imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg' };

describe('handleFoodCheck', () => {
  it('로그인 정보가 없으면 401', async () => {
    const deps = makeDeps({ getUid: vi.fn(async () => null) });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(401);
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it('패스가 없으면 402, consume 호출 안 함', async () => {
    const deps = makeDeps({
      premiumClient: { rpc: vi.fn(async () => ({ data: false, error: null })) },
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(402);
    expect(deps.premiumClient.rpc).toHaveBeenCalledWith('has_premium_access_for', { p_uid: UID });
    expect(deps.consume).not.toHaveBeenCalled();
    expect(deps.askGemini).not.toHaveBeenCalled();
  });

  it('한도 초과면 429 본문 정확히 일치, Gemini 호출 안 함', async () => {
    const deps = makeDeps({
      consume: vi.fn(async () => ({ allowed: false, remaining: 0, limit: 30 })),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      code: 'PREMIUM_QUOTA_EXCEEDED',
      error: PREMIUM_QUOTA_EXCEEDED_MESSAGE,
      remaining: 0,
    });
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('인식 못 하면 200 unrecognized + release 1회, 저장 안 함', async () => {
    const deps = makeDeps({ askGemini: vi.fn(async () => JSON.stringify({ recognized: false })) });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'unrecognized',
      message: '제품명이 잘 보이게 다시 찍어주세요',
    });
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.release).toHaveBeenCalledWith(UID);
    expect(deps.insertCheck).not.toHaveBeenCalled();
  });

  it('Gemini 응답 형식이 잘못되면 500 + release 1회', async () => {
    const deps = makeDeps({ askGemini: vi.fn(async () => 'not json') });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.insertCheck).not.toHaveBeenCalled();
  });

  it('Gemini 호출 자체가 실패하면 500 + release 1회', async () => {
    const deps = makeDeps({
      askGemini: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
  });

  it('행 저장이 실패하면 500 + release 1회', async () => {
    const deps = makeDeps({
      insertCheck: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
  });

  it('사진 저장이 실패하면 500 + release 1회, 만든 행은 지운다', async () => {
    const deps = makeDeps({
      storeImages: vi.fn(async () => {
        throw new Error('decode failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.deleteCheck).toHaveBeenCalledWith(100);
    expect(deps.updateImagePaths).not.toHaveBeenCalled();
  });

  it('경로 update가 실패해도 release 1회', async () => {
    const deps = makeDeps({
      updateImagePaths: vi.fn(async () => {
        throw new Error('update failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
  });

  it('정상(text) → 200 ok, 저장 deps에 verdict/basis 계산값과 주차 전달', async () => {
    const deps = makeDeps();
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(200);

    expect(deps.insertCheck).toHaveBeenCalledWith({
      uid: UID,
      input_type: 'text',
      input_text: '훈제 닭가슴살',
      product_name: '훈제 닭가슴살',
      score: 8,
      verdict: 'ok',
      basis: 'estimate',
      reasons: ['단백질이 많아요'],
      alternatives: [],
      week: 3,
    });
    expect(deps.storeImages).not.toHaveBeenCalled();
    expect(deps.signThumbUrl).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();

    // 주차 규칙이 프롬프트에 반영된다 (2026-10-01 시작, KST 10/20 → 3주차)
    const [prompt, input] = (deps.askGemini as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain('3주차');
    expect(input).toEqual({ type: 'text', text: '훈제 닭가슴살' });

    expect(await res.json()).toEqual({
      status: 'ok',
      check: {
        id: 100,
        uid: UID,
        inputType: 'text',
        inputText: '훈제 닭가슴살',
        imagePath: null,
        thumbPath: null,
        productName: '훈제 닭가슴살',
        score: 8,
        verdict: 'ok',
        basis: 'estimate',
        reasons: ['단백질이 많아요'],
        alternatives: [],
        week: 3,
        createdAt: '2026-10-20T03:00:01.000Z',
        thumbUrl: null,
      },
    });
  });

  it('정상(label 사진, 낮은 점수) → avoid/label, 사진 저장 후 경로와 thumbUrl 포함', async () => {
    const deps = makeDeps({
      getStartDate: vi.fn(async () => null),
      askGemini: vi.fn(async () =>
        geminiOk({ productName: '초코파이', score: 2, alternatives: ['삶은 계란', '두유'] })
      ),
    });
    const res = await handleFoodCheck(
      req({ type: 'label', imageBase64: 'aGVsbG8=', mimeType: 'image/png' }),
      deps
    );
    expect(res.status).toBe(200);
    expect(deps.insertCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        input_type: 'label',
        input_text: null,
        verdict: 'avoid',
        basis: 'label',
        alternatives: ['삶은 계란', '두유'],
        week: 1,
      })
    );
    expect(deps.storeImages).toHaveBeenCalledWith(UID, 100, 'aGVsbG8=');
    expect(deps.updateImagePaths).toHaveBeenCalledWith(100, {
      imagePath: `${UID}/100.jpg`,
      thumbPath: `${UID}/100_thumb.jpg`,
    });
    const body = await res.json();
    expect(body.check.imagePath).toBe(`${UID}/100.jpg`);
    expect(body.check.thumbPath).toBe(`${UID}/100_thumb.jpg`);
    expect(body.check.thumbUrl).toBe(`https://signed/${UID}/100_thumb.jpg`);
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('signed URL 생성이 실패해도 판정은 200 (thumbUrl null), release 안 함', async () => {
    const deps = makeDeps({
      signThumbUrl: vi.fn(async () => {
        throw new Error('sign failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).check.thumbUrl).toBeNull();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it.each([
    ['빈 문자열', { type: 'text', text: '' }],
    ['공백만', { type: 'text', text: '   ' }],
    ['51자', { type: 'text', text: '가'.repeat(51) }],
    ['text 누락', { type: 'text' }],
    ['알 수 없는 type', { type: 'video', text: 'a' }],
    ['imageBase64 누락', { type: 'front', mimeType: 'image/jpeg' }],
    ['지원하지 않는 mimeType', { type: 'front', imageBase64: 'aGVsbG8=', mimeType: 'image/gif' }],
    ['JSON 아님', 'not json'],
  ])('%s → 400, 패스·consume 확인 안 함', async (_label, body) => {
    const deps = makeDeps();
    const res = await handleFoodCheck(req(body), deps);
    expect(res.status).toBe(400);
    expect(deps.premiumClient.rpc).not.toHaveBeenCalled();
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it('text 50자는 통과', async () => {
    const deps = makeDeps();
    const res = await handleFoodCheck(req({ type: 'text', text: '가'.repeat(50) }), deps);
    expect(res.status).toBe(200);
  });

  it('imageBase64 4MB 초과 → 413, consume 안 함', async () => {
    const deps = makeDeps();
    const big = {
      type: 'front',
      imageBase64: 'A'.repeat(MAX_BODY_BYTES + 1),
      mimeType: 'image/jpeg',
    };
    const res = await handleFoodCheck(req(big), deps);
    expect(res.status).toBe(413);
    expect(deps.consume).not.toHaveBeenCalled();
  });

  it('content-length 헤더가 4MB를 넘으면 본문을 읽기 전에 413', async () => {
    const deps = makeDeps();
    const r = req(textBody, { 'Content-Length': String(MAX_BODY_BYTES + 1) });
    const res = await handleFoodCheck(r, deps);
    expect(res.status).toBe(413);
    expect(r.bodyUsed).toBe(false);
  });

  it('MAX_BODY_BYTES는 4MB', () => {
    expect(MAX_BODY_BYTES).toBe(4 * 1024 * 1024);
  });
});
