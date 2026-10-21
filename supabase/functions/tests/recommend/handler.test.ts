import { describe, expect, it, vi } from 'vitest';
import {
  handleRecommend,
  type RecipeCandidateRow,
  type RecipeCardRow,
  type RecommendDeps,
} from '../../recommend-recipes/handler.ts';

const UID = 'user-1';

const candidate = (o: Partial<RecipeCandidateRow> = {}): RecipeCandidateRow => ({
  id: 1,
  week: 1,
  is_zero_carb: true,
  cooking_time: 10,
  ingredients: JSON.stringify([{ name: '두부', isOptional: false, amount: '1모' }]),
  spicy: false,
  cuisine: 'korean',
  method: 'soup',
  ...o,
});

const card = (id: number): RecipeCardRow => ({
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

const makeDeps = (o: Partial<RecommendDeps> = {}): RecommendDeps => ({
  getUid: vi.fn(async () => UID),
  premiumClient: { rpc: vi.fn(async () => ({ data: true, error: null })) },
  // 2026-10-01 시작, 2026-10-20(KST) → 3주차 6일차 (step 4: 저녁은 무탄수)
  getStartDate: vi.fn(async () => '2026-10-01'),
  now: () => new Date('2026-10-20T03:00:00Z'),
  random: () => 0,
  getExcludedIngredients: vi.fn(async () => []),
  getRegisteredIngredients: vi.fn(async () => [
    { name: '닭가슴살', sub_keywords: ['닭 가슴살'] },
    { name: '두부', sub_keywords: [] },
    { name: '오이', sub_keywords: [] },
  ]),
  fetchCandidates: vi.fn(async () => [candidate()]),
  fetchCards: vi.fn(async (ids: number[]) => ids.map(card)),
  fetchOwnSaves: vi.fn(async () => []),
  countOtherSaves: vi.fn(async (_uid: string, ids: number[]) =>
    Object.fromEntries(ids.map((id) => [id, 0]))
  ),
  ...o,
});

const req = (body: unknown) =>
  new Request('http://localhost/recommend-recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const read = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('handleRecommend', () => {
  it('로그인 정보가 없으면 401', async () => {
    const deps = makeDeps({ getUid: vi.fn(async () => null) });
    expect((await handleRecommend(req({}), deps)).status).toBe(401);
  });

  it('패스가 없으면 402, 후보 조회 안 함', async () => {
    const deps = makeDeps({
      premiumClient: { rpc: vi.fn(async () => ({ data: false, error: null })) },
    });
    const res = await handleRecommend(req({}), deps);
    expect(res.status).toBe(402);
    expect(deps.premiumClient.rpc).toHaveBeenCalledWith('has_premium_access_for', { p_uid: UID });
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
  });

  it.each([
    [{ cuisine: 'thai' }],
    [{ method: 'fry' }],
    [{ meal: 'snack' }],
    [{ maxMinutes: 20 }],
    [{ spicy: 'yes' }],
    [{ exclude: 'oil' }],
    [{ mustInclude: ['a', 'b', 'c'] }],
    [{ exclude: Array.from({ length: 31 }, (_, i) => `x${i}`) }],
    ['not json'],
  ])('값 목록 밖이면 400: %j', async (body) => {
    const deps = makeDeps();
    const res = await handleRecommend(req(body), deps);
    expect(res.status).toBe(400);
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
  });

  it('빈 문자열은 버린 뒤 개수를 센다', async () => {
    const { status, body } = await read(
      await handleRecommend(req({ mustInclude: ['두부', '', ' ', ''] }), makeDeps())
    );
    expect(status).toBe(200);
    expect(body.recipes.map((r: { id: number }) => r.id)).toEqual([1]);
  });

  it('제외 재료는 포함 여부로 거른다 (복합 이름·괄호 안·상위 재료)', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => [
        candidate({ id: 1, ingredients: JSON.stringify(['닭가슴살 소시지']) }),
        candidate({ id: 2, ingredients: JSON.stringify(['양념장 (고추장, 마늘)']) }),
        candidate({ id: 3, ingredients: JSON.stringify(['돼지목살']) }),
        candidate({ id: 4, ingredients: JSON.stringify(['두부']) }),
      ]),
    });
    const { body } = await read(
      await handleRecommend(req({ exclude: ['소시지', '고추장', '돼지'] }), deps)
    );
    expect(body.totalMatches).toBe(1);
    expect(body.recipes.map((r: { id: number }) => r.id)).toEqual([4]);
  });

  it('재료 항목 모양을 알 수 없으면 그 레시피는 뺀다', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => [
        candidate({ id: 1, ingredients: JSON.stringify(['두부', { title: '오이' }]) }),
        candidate({ id: 2, ingredients: JSON.stringify(['두부', 3]) }),
        candidate({ id: 3, ingredients: JSON.stringify([{ name: '두부' }]) }),
      ]),
    });
    const { body } = await read(await handleRecommend(req({}), deps));
    expect(body.recipes.map((r: { id: number }) => r.id)).toEqual([3]);
  });

  const excludeCandidates = () =>
    vi.fn(async () => [
      candidate({ id: 1, ingredients: JSON.stringify(['닭 가슴살 (껍질 제거)']) }),
      candidate({ id: 2, ingredients: JSON.stringify([{ name: '오이 1/2개', amount: '' }]) }),
      candidate({ id: 3, ingredients: JSON.stringify(['두부']) }),
    ]);

  it('요청에 exclude가 있으면 그 목록만 쓴다 (저장된 목록은 무시, 정규화 포함)', async () => {
    const deps = makeDeps({
      getExcludedIngredients: vi.fn(async () => ['닭가슴살']),
      fetchCandidates: excludeCandidates(),
    });
    const { status, body } = await read(await handleRecommend(req({ exclude: ['오이'] }), deps));
    expect(status).toBe(200);
    expect(deps.getExcludedIngredients).not.toHaveBeenCalled();
    expect(body.totalMatches).toBe(2);
    expect(body.recipes.map((r: { id: number }) => r.id).sort()).toEqual([1, 3]);
  });

  it('요청 exclude가 빈 배열이면 아무것도 빼지 않는다 (저장된 목록을 화면에서 지운 경우)', async () => {
    const deps = makeDeps({
      getExcludedIngredients: vi.fn(async () => ['닭가슴살']),
      fetchCandidates: excludeCandidates(),
    });
    const { body } = await read(await handleRecommend(req({ exclude: [] }), deps));
    expect(deps.getExcludedIngredients).not.toHaveBeenCalled();
    expect(body.totalMatches).toBe(3);
  });

  it('exclude를 빼고 보내면 저장된 제외 재료를 쓴다', async () => {
    const deps = makeDeps({
      getExcludedIngredients: vi.fn(async () => ['닭가슴살', '오이']),
      fetchCandidates: excludeCandidates(),
    });
    const { body } = await read(await handleRecommend(req({}), deps));
    expect(deps.getExcludedIngredients).toHaveBeenCalledWith(UID);
    expect(body.totalMatches).toBe(1);
    expect(body.recipes.map((r: { id: number }) => r.id)).toEqual([3]);
  });

  it('필수 재료도 정규화해 비교한다', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => [
        candidate({ id: 1, ingredients: JSON.stringify(['닭가슴살(200g)']) }),
        candidate({ id: 2, ingredients: JSON.stringify(['두부']) }),
      ]),
    });
    const { body } = await read(await handleRecommend(req({ mustInclude: ['닭 가슴살'] }), deps));
    expect(body.recipes.map((r: { id: number }) => r.id)).toEqual([1]);
  });

  it('후보는 min(주차,4)까지로 조회한다', async () => {
    const deps = makeDeps({ getStartDate: vi.fn(async () => '2026-08-01') });
    await handleRecommend(req({}), deps);
    expect(deps.fetchCandidates).toHaveBeenCalledWith(4);

    const deps2 = makeDeps();
    await handleRecommend(req({}), deps2);
    expect(deps2.fetchCandidates).toHaveBeenCalledWith(3);
  });

  it('맞는 레시피가 없으면 빈 목록과 0', async () => {
    const deps = makeDeps({ fetchCandidates: vi.fn(async () => []) });
    const { status, body } = await read(await handleRecommend(req({ spicy: true }), deps));
    expect(status).toBe(200);
    expect(body).toEqual({ recipes: [], totalMatches: 0 });
    expect(deps.fetchCards).not.toHaveBeenCalled();
  });

  it('쉐이크 끼니면 reason shake로 빈 목록', async () => {
    const deps = makeDeps();
    const { status, body } = await read(await handleRecommend(req({ meal: 'breakfast' }), deps));
    expect(status).toBe(200);
    expect(body).toEqual({ recipes: [], totalMatches: 0, reason: 'shake' });
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
  });

  it('후보가 5개를 넘으면 5개만, totalMatches는 전체 수', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () =>
        Array.from({ length: 8 }, (_, i) => candidate({ id: i + 1 }))
      ),
    });
    const { body } = await read(await handleRecommend(req({}), deps));
    expect(body.totalMatches).toBe(8);
    expect(body.recipes).toHaveLength(5);
    expect(deps.fetchCards).toHaveBeenCalledWith(body.recipes.map((r: { id: number }) => r.id));
  });

  it('응답은 recipe_with_is_saved 행 모양 (is_saved·saved_at·saved_count)', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => [candidate({ id: 1 }), candidate({ id: 2 })]),
      fetchOwnSaves: vi.fn(async () => [{ recipe_id: 2, created_at: '2026-10-05T00:00:00Z' }]),
      countOtherSaves: vi.fn(async () => ({ 1: 3, 2: 7 })),
    });
    const { body } = await read(await handleRecommend(req({}), deps));
    expect(deps.fetchOwnSaves).toHaveBeenCalledWith(UID, expect.any(Array));
    expect(deps.countOtherSaves).toHaveBeenCalledWith(UID, expect.any(Array));
    const byId = Object.fromEntries(body.recipes.map((r: { id: number }) => [r.id, r]));
    expect(byId[1]).toEqual({ ...card(1), is_saved: false, saved_at: null, saved_count: 3 });
    expect(byId[2]).toEqual({
      ...card(2),
      is_saved: true,
      saved_at: '2026-10-05T00:00:00Z',
      saved_count: 7,
    });
  });

  it('조회 실패는 500', async () => {
    const deps = makeDeps({
      fetchCandidates: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleRecommend(req({}), deps)).status).toBe(500);
    spy.mockRestore();
  });
});
