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
const PREPARED = { original: new Uint8Array([1]), thumb: new Uint8Array([2]) };

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
    // 기본: 무료 체험 다 씀 (패스 사용자는 부르지 않는다)
    consumeTrial: vi.fn(async () => -1),
    releaseTrial: vi.fn(async () => undefined),
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
    prepareImages: vi.fn(async () => PREPARED),
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
    expect(deps.consumeTrial).toHaveBeenCalledWith(UID);
    expect(deps.consume).not.toHaveBeenCalled();
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.releaseTrial).not.toHaveBeenCalled();
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
        throw new Error('upload failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.deleteCheck).toHaveBeenCalledWith(100);
    expect(deps.updateImagePaths).not.toHaveBeenCalled();
  });

  it('사진 디코드가 실패하면 Gemini 호출 전에 500 + release 1회, 행을 만들지 않음', async () => {
    const deps = makeDeps({
      prepareImages: vi.fn(async () => {
        throw new Error('decode failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(500);
    expect(deps.consume).toHaveBeenCalledTimes(1);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.insertCheck).not.toHaveBeenCalled();
  });

  it('사진은 Gemini 호출 전에 디코드한다', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      prepareImages: vi.fn(async () => {
        order.push('prepare');
        return PREPARED;
      }),
      askGemini: vi.fn(async () => {
        order.push('gemini');
        return geminiOk();
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect(order).toEqual(['prepare', 'gemini']);
  });

  it('1주차 1~3일차와 4일차 이후를 프롬프트에서 구분 (일차 전달)', async () => {
    // KST 10/20, 시작일 10/19 → 1주차 2일차 / 시작일 10/15 → 1주차 6일차
    const early = makeDeps({ getStartDate: vi.fn(async () => '2026-10-19') });
    await handleFoodCheck(req(textBody), early);
    const [earlyPrompt] = (early.askGemini as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(earlyPrompt).toContain('하루 4끼 모두 프로틴쉐이크');

    const later = makeDeps({ getStartDate: vi.fn(async () => '2026-10-15') });
    await handleFoodCheck(req(textBody), later);
    const [laterPrompt] = (later.askGemini as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(laterPrompt).toContain('점심 저탄수식');
    expect(laterPrompt).not.toContain('하루 4끼 모두 프로틴쉐이크');
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
    expect(deps.prepareImages).not.toHaveBeenCalled();
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
    expect(deps.prepareImages).toHaveBeenCalledWith({
      imageBase64: 'aGVsbG8=',
      mimeType: 'image/png',
    });
    expect(deps.storeImages).toHaveBeenCalledWith(UID, 100, PREPARED);
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

describe('handleFoodCheck 무료 체험 (패스 없음)', () => {
  const noPass = (o: Partial<FoodCheckDeps> = {}) =>
    makeDeps({
      premiumClient: { rpc: vi.fn(async () => ({ data: false, error: null })) },
      consumeTrial: vi.fn(async () => 2),
      ...o,
    });

  it('패스 사용자는 무료 체험을 쓰지 않고 응답에 trialRemaining이 없다', async () => {
    const deps = makeDeps();
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(200);
    expect(deps.consumeTrial).not.toHaveBeenCalled();
    expect(await res.json()).not.toHaveProperty('trialRemaining');
  });

  it('남아 있으면 하루 한도도 차감하고 판정, 200에 trialRemaining', async () => {
    const deps = noPass();
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(200);
    expect(deps.consumeTrial).toHaveBeenCalledWith(UID);
    expect(deps.consume).toHaveBeenCalledTimes(1);
    expect(deps.askGemini).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.trialRemaining).toBe(2);
    expect(deps.releaseTrial).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('마지막 1번을 쓰면 trialRemaining 0', async () => {
    const deps = noPass({ consumeTrial: vi.fn(async () => 0) });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).trialRemaining).toBe(0);
  });

  it('인식 못 하면 무료 체험은 되돌리고 하루 한도는 되돌리지 않는다 (Gemini 호출을 하루 한도로 묶음)', async () => {
    const deps = noPass({ askGemini: vi.fn(async () => JSON.stringify({ recognized: false })) });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('unrecognized');
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
    expect(deps.releaseTrial).toHaveBeenCalledWith(UID);
  });

  it('Gemini가 실패하면 500 + 무료 체험만 되돌림 (하루 한도는 그대로)', async () => {
    const deps = noPass({
      askGemini: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
  });

  it('Gemini 응답 형식이 잘못되면 500 + 무료 체험만 되돌림 (하루 한도는 그대로)', async () => {
    const deps = noPass({ askGemini: vi.fn(async () => 'not json') });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
  });

  it('인식 실패를 되풀이해도 하루 한도가 차면 Gemini를 더 부르지 않는다', async () => {
    let used = 0;
    const deps = noPass({
      consume: vi.fn(async () => {
        const allowed = used < 2;
        if (allowed) used++;
        return { allowed, remaining: 2 - used, limit: 2 };
      }),
      release: vi.fn(async () => {
        used--;
      }),
      askGemini: vi.fn(async () => JSON.stringify({ recognized: false })),
    });
    for (let i = 0; i < 5; i++) await handleFoodCheck(req(textBody), deps);
    expect(deps.askGemini).toHaveBeenCalledTimes(2);
  });

  it('패스 사용자는 인식 실패 시 지금처럼 하루 한도를 되돌린다', async () => {
    const deps = makeDeps({ askGemini: vi.fn(async () => JSON.stringify({ recognized: false })) });
    await handleFoodCheck(req(textBody), deps);
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(deps.releaseTrial).not.toHaveBeenCalled();
  });

  it('사진 저장이 실패하면 500 + 무료 체험 되돌림', async () => {
    const deps = noPass({
      storeImages: vi.fn(async () => {
        throw new Error('upload failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(500);
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
  });

  it('하루 한도를 넘으면 429 + 무료 체험 되돌림 (Gemini 호출 안 함)', async () => {
    const deps = noPass({
      consume: vi.fn(async () => ({ allowed: false, remaining: 0, limit: 30 })),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(429);
    expect(deps.askGemini).not.toHaveBeenCalled();
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
  });

  it('하루 한도 확인이 실패하면 500 + 무료 체험 되돌림', async () => {
    const deps = noPass({
      consume: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.releaseTrial).toHaveBeenCalledTimes(1);
  });

  it('무료 체험 되돌리기가 실패해도 원래 응답을 돌려준다', async () => {
    const deps = noPass({
      askGemini: vi.fn(async () => JSON.stringify({ recognized: false })),
      releaseTrial: vi.fn(async () => {
        throw new Error('release failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('unrecognized');
  });

  it('썸네일 URL 실패는 판정 성공이므로 무료 체험을 되돌리지 않는다', async () => {
    const deps = noPass({
      signThumbUrl: vi.fn(async () => {
        throw new Error('sign failed');
      }),
    });
    const res = await handleFoodCheck(req(photoBody), deps);
    expect(res.status).toBe(200);
    expect(deps.releaseTrial).not.toHaveBeenCalled();
  });

  it('무료 체험 확인 자체가 실패하면 500, 한도 차감 안 함', async () => {
    const deps = noPass({
      consumeTrial: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.consume).not.toHaveBeenCalled();
    expect(deps.releaseTrial).not.toHaveBeenCalled();
  });

  it('패스 확인 rpc가 실패하면 무료 체험을 쓰지 않고 500', async () => {
    const deps = noPass({
      premiumClient: { rpc: vi.fn(async () => ({ data: null, error: new Error('down') })) },
    });
    const res = await handleFoodCheck(req(textBody), deps);
    expect(res.status).toBe(500);
    expect(deps.consumeTrial).not.toHaveBeenCalled();
  });
});
