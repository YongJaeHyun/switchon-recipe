import { describe, expect, it, vi } from 'vitest';
import {
  handleEstimateServings,
  runEstimation,
  type EstimateServingsDeps,
  type ServingsSourceRow,
} from '../../estimate-recipe-servings/handler.ts';

const src = (id: number): ServingsSourceRow => ({
  id,
  recipe_name: `레시피${id}`,
  ingredients: JSON.stringify([{ name: '돼지고기 앞다리살', isOptional: false, amount: '200g' }]),
  cooking_steps: JSON.stringify(['볶는다']),
});

const idsInPrompt = (prompt: string) =>
  [...prompt.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1]));

// 프롬프트에 든 id마다 1인분을 돌려주는 가짜 Gemini
const okGemini = vi.fn(async (prompt: string) =>
  JSON.stringify(idsInPrompt(prompt).map((id) => ({ id, servings: 1 })))
);

const makeDeps = (o: Partial<EstimateServingsDeps> = {}): EstimateServingsDeps => ({
  fetchMissing: vi.fn(async (afterId: number | null, limit: number) =>
    Array.from({ length: 23 }, (_, i) => src(i + 1))
      .filter((r) => afterId === null || r.id > afterId)
      .slice(0, limit)
  ),
  askGemini: okGemini,
  updateServings: vi.fn(async () => undefined),
  countRemaining: vi.fn(async () => 0),
  ...o,
});

describe('runEstimation', () => {
  it('최대 50개를 10개씩 나눠 추정하고 lastId를 돌려준다', async () => {
    const deps = makeDeps({ countRemaining: vi.fn(async () => 4) });
    const result = await runEstimation(deps, null);
    expect(deps.fetchMissing).toHaveBeenCalledWith(null, 50);
    expect(deps.askGemini).toHaveBeenCalledTimes(3);
    expect(deps.updateServings).toHaveBeenCalledTimes(23);
    expect(deps.updateServings).toHaveBeenCalledWith(1, 1);
    expect(result).toEqual({ estimated: 23, failed: 0, remaining: 4, lastId: 23 });
  });

  it('프롬프트에 재료 양을 함께 넣는다', async () => {
    const askGemini = vi.fn(okGemini);
    await runEstimation(makeDeps({ askGemini }), null);
    expect(askGemini.mock.calls[0][0]).toContain('"돼지고기 앞다리살 200g"');
  });

  it('커서 다음부터 가져오고, 가져온 것이 없으면 커서를 그대로 돌려준다', async () => {
    const deps = makeDeps();
    expect((await runEstimation(deps, 20)).lastId).toBe(23);
    expect(deps.fetchMissing).toHaveBeenCalledWith(20, 50);
    expect(await runEstimation(deps, 23)).toEqual({
      estimated: 0,
      failed: 0,
      remaining: 0,
      lastId: 23,
    });
  });

  it('배치 하나의 Gemini 실패는 그 배치 전체를 실패로 센다', async () => {
    const askGemini = vi.fn(async (prompt: string) => {
      if (idsInPrompt(prompt).includes(11)) throw new Error('timeout');
      return okGemini(prompt);
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runEstimation(makeDeps({ askGemini }), null);
    spy.mockRestore();
    expect(result).toMatchObject({ estimated: 13, failed: 10, lastId: 23 });
  });

  it('응답에서 빠졌거나 범위 밖인 항목, update 오류는 실패로 센다 (null로 남겨 다음에 재시도)', async () => {
    const askGemini = vi.fn(async (prompt: string) =>
      JSON.stringify(
        idsInPrompt(prompt)
          .filter((id) => id !== 3)
          .map((id) => ({ id, servings: id === 2 ? 9 : 2 }))
      )
    );
    const updateServings = vi.fn(async (id: number) => {
      if (id === 5) throw new Error('db');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runEstimation(makeDeps({ askGemini, updateServings }), null);
    spy.mockRestore();
    expect(result).toMatchObject({ estimated: 20, failed: 3, lastId: 23 });
    expect(updateServings).not.toHaveBeenCalledWith(2, expect.anything());
    expect(updateServings).toHaveBeenCalledWith(4, 2);
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

const req = (auth: string | null, body?: unknown) =>
  new Request('http://localhost/estimate-recipe-servings', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('handleEstimateServings', () => {
  it('service role이 아니면 403', async () => {
    const deps = makeDeps();
    expect((await handleEstimateServings(req(jwt('authenticated')), deps)).status).toBe(403);
    expect((await handleEstimateServings(req(null), deps)).status).toBe(403);
    expect(deps.fetchMissing).not.toHaveBeenCalled();
  });

  it('본문 없이 호출하면 처음부터', async () => {
    const deps = makeDeps();
    const res = await handleEstimateServings(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estimated: 23, failed: 0, remaining: 0, lastId: 23 });
    expect(deps.fetchMissing).toHaveBeenCalledWith(null, 50);
  });

  it('afterId를 커서로 쓴다', async () => {
    const deps = makeDeps();
    await handleEstimateServings(req(jwt('service_role'), { afterId: 10 }), deps);
    expect(deps.fetchMissing).toHaveBeenCalledWith(10, 50);
  });

  it('afterId가 0 이상 정수가 아니거나 본문이 JSON이 아니면 400', async () => {
    const deps = makeDeps();
    for (const afterId of ['10', 1.5, -1]) {
      const res = await handleEstimateServings(req(jwt('service_role'), { afterId }), deps);
      expect(res.status).toBe(400);
    }
    const bad = new Request('http://localhost/estimate-recipe-servings', {
      method: 'POST',
      headers: { Authorization: jwt('service_role') },
      body: '{',
    });
    expect((await handleEstimateServings(bad, deps)).status).toBe(400);
    expect(deps.fetchMissing).not.toHaveBeenCalled();
  });

  it('조회 실패는 500이고 상세는 응답에 싣지 않는다', async () => {
    const deps = makeDeps({
      fetchMissing: vi.fn(async () => {
        throw new Error('secret db detail');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleEstimateServings(req(jwt('service_role')), deps);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
  });
});
