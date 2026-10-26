import { describe, expect, it, vi } from 'vitest';
import {
  handleTagRecipes,
  runTagging,
  type TagRecipesDeps,
  type TagSourceRow,
} from '../../tag-recipes/handler.ts';

const src = (id: number): TagSourceRow => ({
  id,
  recipe_name: `레시피${id}`,
  ingredients: JSON.stringify(['두부']),
  cooking_steps: JSON.stringify(['끓인다']),
});

const idsInPrompt = (prompt: string) =>
  [...prompt.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1]));

// 프롬프트에 든 id마다 유효한 태그를 돌려주는 가짜 Gemini
const okGemini = vi.fn(async (prompt: string) =>
  JSON.stringify(
    idsInPrompt(prompt).map((id) => ({ id, spicy: false, cuisine: 'korean', method: 'soup' }))
  )
);

const makeDeps = (o: Partial<TagRecipesDeps> = {}): TagRecipesDeps => ({
  fetchUntagged: vi.fn(async (afterId: number | null, limit: number) =>
    Array.from({ length: 23 }, (_, i) => src(i + 1))
      .filter((r) => afterId === null || r.id > afterId)
      .slice(0, limit)
  ),
  askGemini: okGemini,
  updateTags: vi.fn(async () => undefined),
  countRemaining: vi.fn(async () => 0),
  ...o,
});

describe('runTagging', () => {
  it('최대 50개를 10개씩 나눠 태깅하고 lastId를 돌려준다', async () => {
    const deps = makeDeps({ countRemaining: vi.fn(async () => 4) });
    const result = await runTagging(deps, null);
    expect(deps.fetchUntagged).toHaveBeenCalledWith(null, 50);
    expect(deps.askGemini).toHaveBeenCalledTimes(3);
    expect(deps.updateTags).toHaveBeenCalledTimes(23);
    expect(deps.updateTags).toHaveBeenCalledWith(1, {
      spicy: false,
      cuisine: 'korean',
      method: 'soup',
    });
    expect(result).toEqual({ tagged: 23, failed: 0, remaining: 4, lastId: 23 });
  });

  it('커서 다음부터 가져오고, 가져온 것이 없으면 커서를 그대로 돌려준다', async () => {
    const deps = makeDeps();
    expect((await runTagging(deps, 20)).lastId).toBe(23);
    expect(deps.fetchUntagged).toHaveBeenCalledWith(20, 50);
    expect(await runTagging(deps, 23)).toEqual({
      tagged: 0,
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
    const result = await runTagging(makeDeps({ askGemini }), null);
    spy.mockRestore();
    expect(result).toMatchObject({ tagged: 13, failed: 10, lastId: 23 });
  });

  it('응답에서 빠졌거나 잘못된 항목, update 오류는 실패로 센다', async () => {
    const askGemini = vi.fn(async (prompt: string) =>
      JSON.stringify(
        idsInPrompt(prompt).map((id) =>
          id === 2
            ? { id, spicy: 'yes', cuisine: 'korean', method: 'soup' }
            : { id, spicy: true, cuisine: 'korean', method: 'soup' }
        )
      )
    );
    const updateTags = vi.fn(async (id: number) => {
      if (id === 5) throw new Error('db');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runTagging(makeDeps({ askGemini, updateTags }), null);
    spy.mockRestore();
    expect(result).toMatchObject({ tagged: 21, failed: 2, lastId: 23 });
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

const req = (auth: string | null, body?: unknown) =>
  new Request('http://localhost/tag-recipes', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('handleTagRecipes', () => {
  it('service role이 아니면 403', async () => {
    const deps = makeDeps();
    expect((await handleTagRecipes(req(jwt('authenticated')), deps)).status).toBe(403);
    expect((await handleTagRecipes(req(null), deps)).status).toBe(403);
    expect(deps.fetchUntagged).not.toHaveBeenCalled();
  });

  it('본문 없이 호출하면 처음부터', async () => {
    const deps = makeDeps();
    const res = await handleTagRecipes(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tagged: 23, failed: 0, remaining: 0, lastId: 23 });
    expect(deps.fetchUntagged).toHaveBeenCalledWith(null, 50);
  });

  it('afterId를 커서로 쓴다', async () => {
    const deps = makeDeps();
    await handleTagRecipes(req(jwt('service_role'), { afterId: 10 }), deps);
    expect(deps.fetchUntagged).toHaveBeenCalledWith(10, 50);
  });

  it('afterId가 정수가 아니면 400', async () => {
    const deps = makeDeps();
    for (const afterId of ['10', 1.5, -1]) {
      const res = await handleTagRecipes(req(jwt('service_role'), { afterId }), deps);
      expect(res.status).toBe(400);
    }
    expect(deps.fetchUntagged).not.toHaveBeenCalled();
  });

  it('조회 실패는 500', async () => {
    const deps = makeDeps({
      fetchUntagged: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleTagRecipes(req(jwt('service_role')), deps)).status).toBe(500);
    spy.mockRestore();
  });
});
