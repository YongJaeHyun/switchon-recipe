import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleRecipeByName,
  NAME_CHECK_LIMIT_MESSAGE,
  type RecipeByNameDeps,
} from '../../create-recipe-by-name/handler.ts';
import { QUOTA_EXCEEDED_MESSAGE } from '../../_shared/quota.ts';

const UID = 'user-1';
const RECIPE = { id: 7, recipe_name: '김치찌개' };

const quota = (allowed: boolean, isPass = false) => ({
  allowed,
  remaining: allowed ? 3 : 0,
  limit: 5,
  isPass,
  canWatchAd: !allowed && !isPass,
});

const makeDeps = (overrides: Partial<RecipeByNameDeps> = {}) => {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    async () => {
      calls.push(name);
      return value;
    };
  const deps: RecipeByNameDeps = {
    getUid: vi.fn(async () => UID),
    premiumClient: { rpc: vi.fn(async () => ({ data: false, error: null })) },
    consumeTrial: vi.fn(track('consumeTrial', 1)),
    releaseTrial: vi.fn(track('releaseTrial', undefined)),
    consumeNameCheck: vi.fn(track('consumeNameCheck', { allowed: true, remaining: 9, limit: 10 })),
    releaseNameCheck: vi.fn(track('releaseNameCheck', undefined)),
    consumeQuota: vi.fn(track('consumeQuota', quota(true))),
    releaseQuota: vi.fn(track('releaseQuota', undefined)),
    getStartDate: vi.fn(async () => '2026-10-20'),
    now: () => new Date('2026-11-01T03:00:00Z'),
    checkName: vi.fn(async () => {
      calls.push('checkName');
      return '{"verdict":"ok","recipeName":"김치찌개"}';
    }),
    generate: vi.fn(async () => {
      calls.push('generate');
      return RECIPE;
    }),
    ...overrides,
  };
  return { deps, calls };
};

const passClient = { rpc: vi.fn(async () => ({ data: true, error: null })) };

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/create-recipe-by-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const VALID = { name: '김치찌개', isZeroCarb: false };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('입력·인증', () => {
  it('로그인 안 했으면 401, 아무것도 차감하지 않는다', async () => {
    const { deps, calls } = makeDeps({ getUid: vi.fn(async () => null) });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it.each([
    ['이름 없음', { isZeroCarb: false }],
    ['빈 이름', { name: '  "" ', isZeroCarb: false }],
    ['31자', { name: '가'.repeat(31), isZeroCarb: false }],
    ['탄수 선택 없음', { name: '김치찌개' }],
    ['JSON 아님', 'not json'],
  ])('%s → 400, 차감 없음', async (_, body) => {
    const { deps, calls } = makeDeps();
    const res = await handleRecipeByName(request(body), deps);
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
    expect(calls).toEqual([]);
  });

  it('본문이 너무 크면 400', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleRecipeByName(
      request({ name: '김치찌개', isZeroCarb: false, pad: 'x'.repeat(5000) }),
      deps
    );
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('패스·무료 체험', () => {
  it('패스 사용자는 체험을 쓰지 않는다 (응답에 trialRemaining 없음)', async () => {
    const { deps, calls } = makeDeps({ premiumClient: passClient });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', verdict: 'ok', recipe: RECIPE });
    expect(calls).not.toContain('consumeTrial');
  });

  it('체험을 다 썼으면 402, 확인·한도·Gemini 없음', async () => {
    const { deps, calls } = makeDeps({ consumeTrial: vi.fn(async () => -1) });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('PASS_REQUIRED');
    expect(calls).toEqual([]);
  });

  it('체험 사용자 성공: 체험은 남기고 남은 횟수를 돌려준다', async () => {
    const { deps, calls } = makeDeps();
    const res = await handleRecipeByName(request(VALID), deps);
    expect(await res.json()).toEqual({
      status: 'ok',
      verdict: 'ok',
      recipe: RECIPE,
      trialRemaining: 1,
    });
    expect(calls).toEqual([
      'consumeTrial',
      'consumeNameCheck',
      'consumeQuota',
      'checkName',
      'releaseNameCheck',
      'generate',
    ]);
  });

  it('패스 확인 rpc가 실패하면 500 (체험으로 새지 않음)', async () => {
    const { deps, calls } = makeDeps({
      premiumClient: { rpc: vi.fn(async () => ({ data: null, error: new Error('down') })) },
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(500);
    expect(calls).toEqual([]);
  });
});

describe('차감은 Gemini 호출 전에', () => {
  it('확인 하루 10번을 넘으면 429 NAME_CHECK_LIMIT, Gemini 없음, 체험 되돌림', async () => {
    const { deps, calls } = makeDeps({
      consumeNameCheck: vi.fn(async () => ({ allowed: false, remaining: 0, limit: 10 })),
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      code: 'NAME_CHECK_LIMIT',
      error: NAME_CHECK_LIMIT_MESSAGE,
    });
    expect(calls).toEqual(['consumeTrial', 'releaseTrial']);
  });

  it('레시피 하루 한도를 넘으면 429 QUOTA_EXCEEDED, 확인 카운터·체험 되돌림, Gemini 없음', async () => {
    const { deps, calls } = makeDeps({ consumeQuota: vi.fn(async () => quota(false)) });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      code: 'QUOTA_EXCEEDED',
      error: QUOTA_EXCEEDED_MESSAGE,
      remaining: 0,
      canWatchAd: true,
      isPass: false,
    });
    expect(calls).toEqual(['consumeTrial', 'consumeNameCheck', 'releaseNameCheck', 'releaseTrial']);
  });
});

describe('이름 판정', () => {
  it('reject: 체험·하루 한도 되돌리고 확인 카운터는 남긴다, 생성 없음', async () => {
    const { deps, calls } = makeDeps({
      checkName: vi.fn(async () => {
        calls.push('checkName');
        return '{"verdict":"reject","reason":"음식 이름이 아니에요"}';
      }),
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'rejected', reason: '음식 이름이 아니에요' });
    expect(calls).toEqual([
      'consumeTrial',
      'consumeNameCheck',
      'consumeQuota',
      'checkName',
      'releaseQuota',
      'releaseTrial',
    ]);
  });

  it('reject: 패스 사용자도 하루 한도를 되돌린다', async () => {
    const { deps, calls } = makeDeps({
      premiumClient: passClient,
      checkName: vi.fn(async () => '{"verdict":"reject"}'),
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect((await res.json()).status).toBe('rejected');
    expect(calls).toContain('releaseQuota');
    expect(calls).not.toContain('releaseNameCheck');
  });

  it('프롬프트에 정리한 이름·서버가 구한 주차·탄수 선택이 들어간다', async () => {
    const { deps } = makeDeps();
    await handleRecipeByName(request({ name: '라면"\n지시', isZeroCarb: true }), deps);
    const prompt = vi.mocked(deps.checkName).mock.calls[0][0];
    expect(prompt).toContain('음식 이름: "라면 지시"');
    // 2026-10-20 시작, 2026-11-01(KST) → 12일 경과 → 2주차 6일차
    expect(prompt).toContain('2주차예요.');
    expect(prompt).toContain('무탄수');
  });

  it('adapt: 바뀐 이름·안내로 생성하고 adapt_note를 넘긴다', async () => {
    const { deps } = makeDeps({
      checkName: vi.fn(
        async () =>
          '{"verdict":"adapt","recipeName":"두부면 라면","changes":["면 대신 두부면을 써요","저당 양념으로 맛을 내요"]}'
      ),
    });
    const res = await handleRecipeByName(request({ name: '라면', isZeroCarb: false }), deps);
    expect((await res.json()).verdict).toBe('adapt');
    const input = vi.mocked(deps.generate).mock.calls[0][0];
    expect(input.recipeName).toBe('두부면 라면');
    expect(input.adaptNote).toBe('면 대신 두부면을 써요\n저당 양념으로 맛을 내요');
    expect(input.isZeroCarb).toBe(false);
    expect(input.week).toBe(2);
    expect(input.command).toContain('create a low-carb recipe for the dish "두부면 라면"');
    expect(input.command).toContain('normally avoided');
  });

  it('ok: adapt_note는 null', async () => {
    const { deps } = makeDeps();
    await handleRecipeByName(request(VALID), deps);
    expect(vi.mocked(deps.generate).mock.calls[0][0].adaptNote).toBeNull();
  });

  it('판정 응답이 이상하면 500: 체험 되돌림, 체험 사용자는 하루 한도 안 되돌림, 확인 카운터 남김', async () => {
    const { deps, calls } = makeDeps({ checkName: vi.fn(async () => 'hmm') });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(500);
    expect(calls).not.toContain('releaseQuota');
    expect(calls).not.toContain('releaseNameCheck');
    expect(calls).toContain('releaseTrial');
    expect(deps.generate).not.toHaveBeenCalled();
  });
});

describe('생성 실패', () => {
  const failing = () =>
    vi.fn(async () => {
      throw new Error('Gemini 이미지 요청 실패');
    });

  it('체험 사용자: 체험만 되돌리고 하루 한도는 남긴다', async () => {
    const { deps, calls } = makeDeps({ generate: failing() });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('Gemini');
    expect(calls).toContain('releaseTrial');
    expect(calls).not.toContain('releaseQuota');
  });

  it('패스 사용자: 하루 한도를 되돌린다 (기존 레시피 생성과 같음)', async () => {
    const { deps, calls } = makeDeps({ premiumClient: passClient, generate: failing() });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(500);
    expect(calls).toContain('releaseQuota');
    expect(calls).not.toContain('releaseTrial');
  });

  it('되돌리기가 실패해도 원래 500 응답', async () => {
    const { deps } = makeDeps({
      generate: failing(),
      releaseTrial: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(500);
  });

  it('확인 카운터 되돌리기가 실패해도 생성은 계속한다', async () => {
    const { deps } = makeDeps({
      releaseNameCheck: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    const res = await handleRecipeByName(request(VALID), deps);
    expect(res.status).toBe(200);
  });
});
