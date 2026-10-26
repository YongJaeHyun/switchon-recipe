import { describe, expect, it, vi } from 'vitest';
import type { TagBackfillRow } from '../../_shared/recipeIngredientTags.ts';
import {
  handleRefreshIngredientTags,
  PAGE_SIZE,
  refreshIngredientTags,
  type RefreshTagsDeps,
} from '../../refresh-ingredient-tags/handler.ts';

const REGISTERED = [
  { name: '양파', sub_keywords: [] },
  { name: '마늘', sub_keywords: [] },
  { name: '계란', sub_keywords: ['달걀'] },
];

const row = (id: number, names: string[], tags: string[] | null): TagBackfillRow => ({
  id,
  ingredients: JSON.stringify(names.map((name) => ({ name, isOptional: false, amount: '1개' }))),
  ingredient_tags: tags,
});

// id 순 keyset 페이지를 흉내 내는 가짜 DB
const makeDeps = (rows: TagBackfillRow[], o: Partial<RefreshTagsDeps> = {}): RefreshTagsDeps => ({
  fetchRegistered: vi.fn(async () => REGISTERED),
  fetchRecipes: vi.fn(async (afterId: number | null, limit: number, ids?: number[]) =>
    rows
      .filter((r) => (afterId === null || r.id > afterId) && (!ids || ids.includes(r.id)))
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
  ),
  updateTags: vi.fn(async () => undefined),
  ...o,
});

describe('refreshIngredientTags', () => {
  it('계산 태그가 저장값과 다른 행만 update한다', async () => {
    const deps = makeDeps([
      row(1, ['양파'], ['양파']),
      row(2, ['양파', '다진 마늘'], []),
      row(3, ['달걀'], null),
      row(4, ['후추'], ['후추']),
      row(5, ['마늘', '양파'], ['양파', '마늘']), // 순서만 다르면 그대로
    ]);
    const result = await refreshIngredientTags(deps, {});
    expect(result).toEqual({ scanned: 5, updated: 3, failed: [] });
    expect(deps.updateTags).toHaveBeenCalledTimes(3);
    expect(deps.updateTags).toHaveBeenCalledWith(2, ['마늘', '양파']);
    expect(deps.updateTags).toHaveBeenCalledWith(3, ['계란']);
    expect(deps.updateTags).toHaveBeenCalledWith(4, []);
  });

  it('레시피 전체를 id 커서로 페이지를 넘겨 가며 읽는다', async () => {
    const rows = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => row(i + 1, ['양파'], []));
    const deps = makeDeps(rows);
    const result = await refreshIngredientTags(deps, {});
    expect(result.scanned).toBe(PAGE_SIZE * 2 + 3);
    expect(result.updated).toBe(PAGE_SIZE * 2 + 3);
    const calls = vi.mocked(deps.fetchRecipes).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([null, PAGE_SIZE, PAGE_SIZE * 2]);
    expect(calls.every((c) => c[1] === PAGE_SIZE && c[2] === undefined)).toBe(true);
  });

  it('페이지가 꽉 차서 끝나면 빈 페이지를 한 번 더 읽고 멈춘다', async () => {
    const deps = makeDeps(
      Array.from({ length: PAGE_SIZE }, (_, i) => row(i + 1, ['양파'], ['양파']))
    );
    expect(await refreshIngredientTags(deps, {})).toEqual({
      scanned: PAGE_SIZE,
      updated: 0,
      failed: [],
    });
    expect(deps.fetchRecipes).toHaveBeenCalledTimes(2);
    expect(deps.updateTags).not.toHaveBeenCalled();
  });

  it('recipeIds를 주면 그 레시피만 읽는다 (중복 제거)', async () => {
    const deps = makeDeps([row(1, ['양파'], []), row(2, ['마늘'], []), row(3, ['양파'], [])]);
    const result = await refreshIngredientTags(deps, { recipeIds: [3, 1, 3, 99] });
    expect(result).toEqual({ scanned: 2, updated: 2, failed: [] });
    expect(deps.fetchRecipes).toHaveBeenCalledWith(null, PAGE_SIZE, [1, 3, 99]);
    expect(deps.updateTags).not.toHaveBeenCalledWith(2, expect.anything());
  });

  it('recipeIds가 많으면 PAGE_SIZE개씩 나눠 읽는다', async () => {
    const ids = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => i + 1);
    const deps = makeDeps(ids.map((id) => row(id, ['양파'], ['양파'])));
    expect((await refreshIngredientTags(deps, { recipeIds: ids })).scanned).toBe(PAGE_SIZE + 5);
    const idArgs = vi.mocked(deps.fetchRecipes).mock.calls.map((c) => c[2]);
    expect(idArgs.every((a) => a !== undefined && a.length <= PAGE_SIZE)).toBe(true);
    expect(idArgs.flatMap((a) => a ?? [])).toEqual(expect.arrayContaining(ids));
  });

  it('빈 recipeIds는 아무것도 읽지 않는다', async () => {
    const deps = makeDeps([row(1, ['양파'], [])]);
    expect(await refreshIngredientTags(deps, { recipeIds: [] })).toEqual({
      scanned: 0,
      updated: 0,
      failed: [],
    });
    expect(deps.fetchRegistered).not.toHaveBeenCalled();
    expect(deps.fetchRecipes).not.toHaveBeenCalled();
  });

  it('등록 재료가 0개면 태그를 지우지 않도록 멈춘다', async () => {
    const deps = makeDeps([row(1, ['양파'], ['양파'])], { fetchRegistered: vi.fn(async () => []) });
    await expect(refreshIngredientTags(deps, {})).rejects.toThrow('등록 재료');
    expect(deps.updateTags).not.toHaveBeenCalled();
  });

  it('일부 update가 실패해도 나머지는 계속하고 실패 id를 돌려준다', async () => {
    const deps = makeDeps([row(1, ['양파'], []), row(2, ['마늘'], []), row(3, ['계란'], [])], {
      updateTags: vi.fn(async (id: number) => {
        if (id === 2) throw new Error('boom');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await refreshIngredientTags(deps, {})).toEqual({ scanned: 3, updated: 2, failed: [2] });
    spy.mockRestore();
  });

  it('dryRun이면 update하지 않고 바뀔 예시를 돌려준다', async () => {
    const deps = makeDeps([row(1, ['양파'], ['마늘']), row(2, ['마늘'], ['마늘'])]);
    expect(await refreshIngredientTags(deps, { dryRun: true })).toEqual({
      scanned: 2,
      updated: 1,
      failed: [],
      samples: [{ id: 1, before: ['마늘'], tags: ['양파'] }],
    });
    expect(deps.updateTags).not.toHaveBeenCalled();
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;
const req = (auth: string | null, body?: unknown) =>
  new Request('http://localhost/refresh-ingredient-tags', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('handleRefreshIngredientTags', () => {
  it('service role이 아니면 403이고 DB를 건드리지 않는다', async () => {
    const deps = makeDeps([row(1, ['양파'], [])]);
    expect((await handleRefreshIngredientTags(req(null), deps)).status).toBe(403);
    expect((await handleRefreshIngredientTags(req(jwt('anon')), deps)).status).toBe(403);
    expect((await handleRefreshIngredientTags(req(jwt('authenticated')), deps)).status).toBe(403);
    expect(deps.fetchRegistered).not.toHaveBeenCalled();
    expect(deps.updateTags).not.toHaveBeenCalled();
  });

  it('본문이 없으면(cron) 전체를 갱신하고 { scanned, updated, failed }를 돌려준다', async () => {
    const deps = makeDeps([row(1, ['양파'], []), row(2, ['마늘'], ['마늘'])]);
    const res = await handleRefreshIngredientTags(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 2, updated: 1, failed: [] });
  });

  it('빈 객체 본문({}, pg_net 기본값)도 전체 갱신', async () => {
    const deps = makeDeps([row(1, ['양파'], [])]);
    const res = await handleRefreshIngredientTags(req(jwt('service_role'), {}), deps);
    expect(await res.json()).toEqual({ scanned: 1, updated: 1, failed: [] });
  });

  it('recipeIds 본문이면 그 레시피만', async () => {
    const deps = makeDeps([row(1, ['양파'], []), row(2, ['마늘'], [])]);
    const res = await handleRefreshIngredientTags(
      req(jwt('service_role'), { recipeIds: [2] }),
      deps
    );
    expect(await res.json()).toEqual({ scanned: 1, updated: 1, failed: [] });
    expect(deps.updateTags).toHaveBeenCalledWith(2, ['마늘']);
  });

  it.each([
    ['JSON 아님', 'not json'],
    ['배열 본문', [1, 2]],
    ['recipeIds가 배열이 아님', { recipeIds: 3 }],
    ['recipeIds에 정수가 아닌 값', { recipeIds: [1, 'a'] }],
    ['recipeIds에 0 이하', { recipeIds: [0] }],
    ['recipeIds에 소수', { recipeIds: [1.5] }],
    ['dryRun이 boolean이 아님', { dryRun: 'yes' }],
  ])('잘못된 본문(%s)은 400', async (_, body) => {
    const deps = makeDeps([row(1, ['양파'], [])]);
    const res = await handleRefreshIngredientTags(req(jwt('service_role'), body), deps);
    expect(res.status).toBe(400);
    expect(deps.fetchRecipes).not.toHaveBeenCalled();
  });

  it('처리 중 오류는 500이고 상세는 응답에 담지 않는다', async () => {
    const deps = makeDeps([], {
      fetchRegistered: vi.fn(async () => {
        throw new Error('secret detail');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleRefreshIngredientTags(req(jwt('service_role')), deps);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('secret');
  });
});
