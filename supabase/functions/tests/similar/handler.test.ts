import { describe, expect, it, vi } from 'vitest';
import type { SimilarCandidate } from '../../_shared/similarRecipes.ts';
import {
  handleSimilar,
  type SimilarCardRow,
  type SimilarDeps,
} from '../../similar-recipes/handler.ts';

const UID = 'user-1';

const ing = (...names: string[]) => JSON.stringify(names.map((name) => ({ name })));

const recipe = (o: Partial<SimilarCandidate> = {}): SimilarCandidate => ({
  id: 1,
  recipe_name: `레시피${o.id ?? 1}`,
  ingredients: ing('두부'),
  cuisine: 'korean',
  method: 'soup',
  spicy: false,
  ...o,
});

const card = (id: number): SimilarCardRow => ({
  id,
  recipe_name: `레시피${id}`,
  image_uri: `https://img/${id}.png`,
  ingredients: '[]',
  cooking_steps: '[]',
  cooking_time: 10,
  nutrition: '{}',
  is_zero_carb: true,
  week: 1,
  created_at: '2026-10-01T00:00:00Z',
  uid: null,
});

const TARGET = recipe({
  id: 100,
  recipe_name: '두부 된장국',
  ingredients: ing('두부', '된장', '애호박'),
});

const makeDeps = (o: Partial<SimilarDeps> = {}): SimilarDeps => ({
  getUid: vi.fn(async () => UID),
  // 2026-10-01 시작, 2026-10-20(KST) → 3주차
  getStartDate: vi.fn(async () => '2026-10-01'),
  now: () => new Date('2026-10-20T03:00:00Z'),
  fetchRecipe: vi.fn(async (id: number) => (id === 100 ? TARGET : null)),
  getRegisteredIngredients: vi.fn(async () => [{ name: '두부', sub_keywords: [] }]),
  fetchCandidates: vi.fn(async () => [
    TARGET,
    recipe({ id: 2, ingredients: ing('두부', '된장') }),
    recipe({ id: 3, ingredients: ing('오이'), cuisine: 'western', method: 'salad' }),
  ]),
  fetchSaves: vi.fn(async () => []),
  fetchCards: vi.fn(async (ids: number[]) => ids.map(card)),
  ...o,
});

const req = (body: unknown) =>
  new Request('http://localhost/similar-recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const read = async (res: Response) => ({ status: res.status, body: await res.json() });
const ids = (body: { recipes: { id: number }[] }) => body.recipes.map((r) => r.id);

describe('handleSimilar', () => {
  it('로그인 정보가 없으면 401, 조회 안 함', async () => {
    const deps = makeDeps({ getUid: vi.fn(async () => null) });
    expect((await handleSimilar(req({ recipeId: 100 }), deps)).status).toBe(401);
    expect(deps.fetchRecipe).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ recipeId: '100' }],
    [{ recipeId: 1.5 }],
    [{ recipeId: 0 }],
    [{ recipeId: -3 }],
    [{ recipeId: null }],
    [[100]],
    ['not json'],
  ])('recipeId가 양의 정수가 아니면 400: %j', async (body) => {
    const deps = makeDeps();
    expect((await handleSimilar(req(body), deps)).status).toBe(400);
    expect(deps.fetchRecipe).not.toHaveBeenCalled();
  });

  it('레시피가 없으면 404', async () => {
    const deps = makeDeps();
    expect((await handleSimilar(req({ recipeId: 7 }), deps)).status).toBe(404);
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
  });

  it('패스 없이도 된다 (패스 확인 의존성이 없다)', async () => {
    const { status } = await read(await handleSimilar(req({ recipeId: 100 }), makeDeps()));
    expect(status).toBe(200);
  });

  it('후보는 week <= min(주차, 4)로 조회한다', async () => {
    const deps = makeDeps();
    await handleSimilar(req({ recipeId: 100 }), deps);
    expect(deps.fetchCandidates).toHaveBeenCalledWith(3);

    const late = makeDeps({ now: () => new Date('2026-12-20T03:00:00Z') });
    await handleSimilar(req({ recipeId: 100 }), late);
    expect(late.fetchCandidates).toHaveBeenCalledWith(4);

    const noStart = makeDeps({ getStartDate: vi.fn(async () => null) });
    await handleSimilar(req({ recipeId: 100 }), noStart);
    expect(noStart.fetchCandidates).toHaveBeenCalledWith(1);
  });

  it('자기 자신과 조건에 못 미치는 후보는 빼고 카드 모양으로 돌려준다', async () => {
    const deps = makeDeps({
      fetchSaves: vi.fn(async () => [
        { recipe_id: 2, uid: UID, created_at: '2026-10-10T00:00:00Z' },
        { recipe_id: 2, uid: 'other', created_at: '2026-10-11T00:00:00Z' },
        { recipe_id: 2, uid: 'other2', created_at: '2026-10-12T00:00:00Z' },
      ]),
    });
    const { status, body } = await read(await handleSimilar(req({ recipeId: 100 }), deps));
    expect(status).toBe(200);
    expect(body.recipes).toEqual([
      // 앱 카드는 saved_count + 내 저장 여부로 표시하므로 saved_count는 다른 유저 저장 수
      { ...card(2), is_saved: true, saved_at: '2026-10-10T00:00:00Z', saved_count: 2 },
    ]);
  });

  it('최대 6개, 점수 → 저장 수 → id 순', async () => {
    // 모두 공유 재료 없이 종류·방식이 같다 (동점 3.5)
    const candidates = Array.from({ length: 9 }, (_, i) =>
      recipe({ id: i + 1, ingredients: ing(`x${i}`) })
    );
    // 재료가 겹치는 하나는 점수가 가장 높다
    candidates.push(recipe({ id: 50, ingredients: ing('두부') }));
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => candidates),
      fetchSaves: vi.fn(async () => [
        { recipe_id: 3, uid: 'a', created_at: 'x' },
        { recipe_id: 3, uid: 'b', created_at: 'x' },
        { recipe_id: 1, uid: 'a', created_at: 'x' },
      ]),
    });
    const { body } = await read(await handleSimilar(req({ recipeId: 100 }), deps));
    expect(ids(body)).toEqual([50, 3, 1, 9, 8, 7]);
    // 동점 후보(1~9)와 50만 저장 수를 조회한다
    expect(
      (deps.fetchSaves as ReturnType<typeof vi.fn>).mock.calls[0][0].sort(
        (a: number, b: number) => a - b
      )
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 50]);
    expect(deps.fetchCards).toHaveBeenCalledWith([50, 3, 1, 9, 8, 7]);
  });

  it('중복을 뺀 뒤 모자라면 다음 순위 후보로 6개를 채운다', async () => {
    // 1~6: 이름이 같은 요리(점수가 가장 높음), 7~12: 서로 다른 요리(점수가 낮음)
    const candidates = [
      ...Array.from({ length: 6 }, (_, i) =>
        recipe({
          id: i + 1,
          recipe_name: '두부 된장 볶음',
          ingredients: ing('두부', '된장', `y${i}`),
        })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        recipe({
          id: i + 7,
          recipe_name: `다른 요리${i}`,
          ingredients: ing('두부', `z${i}`, 'w', 'v'),
        })
      ),
    ];
    const deps = makeDeps({ fetchCandidates: vi.fn(async () => candidates) });
    const { body } = await read(await handleSimilar(req({ recipeId: 100 }), deps));
    expect(ids(body)).toEqual([6, 12, 11, 10, 9, 8]);
    // 처음엔 상위 6개(1~6)만, 모자라서 다음 후보까지 저장 기록을 조회한다
    const calls = (deps.fetchSaves as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    expect([...calls[0][0]].sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('비슷한 후보가 없으면 빈 목록, 카드 조회 안 함', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => [
        recipe({ id: 3, ingredients: ing('오이'), cuisine: 'western', method: 'salad' }),
      ]),
    });
    const { status, body } = await read(await handleSimilar(req({ recipeId: 100 }), deps));
    expect(status).toBe(200);
    expect(body.recipes).toEqual([]);
    expect(deps.fetchCards).not.toHaveBeenCalled();
  });

  it('조회 사이에 지워진 레시피는 뺀다', async () => {
    const deps = makeDeps({ fetchCards: vi.fn(async () => []) });
    const { body } = await read(await handleSimilar(req({ recipeId: 100 }), deps));
    expect(body.recipes).toEqual([]);
  });

  it('DB 오류면 500', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleSimilar(req({ recipeId: 100 }), deps)).status).toBe(500);
  });
});
