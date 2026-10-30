import { describe, expect, it, vi } from 'vitest';
import { handleCreateRecipeRequest } from '../../_shared/createRecipeHandler.ts';
import {
  createProviderAlerter,
  createProviderMonitor,
  type ProviderAlertStore,
  withProviderAlert,
} from '../../_shared/providerAlert.ts';
import type { QuotaDecision } from '../../_shared/quota.ts';
import { requestRecipeImage } from '../../_shared/recipeImage.ts';
import { requestRecipeText } from '../../_shared/recipeText.ts';
import { GEMINI_402_BODY } from './fixtures.ts';

// create-recipe-by-gemini 경로: 실제 흐름(createRecipeHandler + recipeText/recipeImage + 알림 fetch)에
// Gemini 자리만 가짜 fetch를 끼운다. supabase·이미지 디코드는 createRecipe.ts(Deno 전용)에 있어 여기서는 뺀다
const allowed: QuotaDecision = {
  allowed: true,
  remaining: 2,
  limit: 3,
  isPass: false,
  canWatchAd: true,
};

const setup = (gemini: (url: string) => Response) => {
  const tasks: Promise<unknown>[] = [];
  const postSlack = vi.fn(async (_text: string) => {});
  const claimed = new Set<string>();
  const store: ProviderAlertStore = {
    recordFailure: async (s) => {
      const key = `${s.provider}${s.model}${s.kind}${s.hour}`;
      return !claimed.has(key) && !!claimed.add(key);
    },
    releaseAlert: async () => {},
    resolve: async () => [],
  };
  const providerFetch = withProviderAlert(
    vi.fn(async (input: RequestInfo | URL) => gemini(String(input))) as unknown as typeof fetch,
    createProviderMonitor({
      functionName: 'create-recipe-by-gemini',
      alerter: createProviderAlerter({ store, postSlack }),
      schedule: (task) => tasks.push(task),
    })
  );
  const release = vi.fn(async (_uid: string) => {});
  const deps = {
    getUserId: async () => 'user-1',
    consume: async () => allowed,
    release,
    generate: async ({ command }: { command: string }) => {
      const recipe = (await requestRecipeText(command, 'GEMINI_KEY', providerFetch)) as {
        recipeName: string;
      };
      await requestRecipeImage(recipe.recipeName, 'GEMINI_KEY', providerFetch);
      return recipe;
    },
  };
  const request = () =>
    new Request('https://x/create-recipe-by-gemini', {
      method: 'POST',
      body: JSON.stringify({ command: '두부 요리', week: 1, is_zero_carb: false }),
    });
  return { deps, request, release, postSlack, flush: () => Promise.all(tasks) };
};

describe('레시피 생성 중 Gemini 402', () => {
  it('운영자 Slack 알림을 한 번 보내고, 유저에게는 전과 같은 500 오류를 돌려주고 한도를 되돌린다', async () => {
    const t = setup(() => new Response(GEMINI_402_BODY, { status: 402 }));

    const res = await handleCreateRecipeRequest(t.request(), t.deps);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Error: Gemini 텍스트 요청 실패 (402)' });
    expect(t.release).toHaveBeenCalledWith('user-1');

    // 같은 시간에 실패가 이어져도 알림은 한 번
    await handleCreateRecipeRequest(t.request(), t.deps);
    await t.flush();

    expect(t.postSlack).toHaveBeenCalledTimes(1);
    const text = t.postSlack.mock.calls[0][0];
    expect(text).toContain('🚨 [Gemini] 결제·크레딧 문제로 호출 실패 (HTTP 402)');
    expect(text).toContain('함수: create-recipe-by-gemini');
    expect(text).toContain('https://ai.studio/projects');
    expect(text).not.toContain('GEMINI_KEY');
  });

  it('이미지 단계에서 402여도 알리고 오류 응답은 그대로다', async () => {
    const t = setup((url) =>
      url.includes('gemini-2.5-flash')
        ? new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: '{"recipeName":"두부조림"}' }] } }],
            })
          )
        : new Response(GEMINI_402_BODY, { status: 402 })
    );

    const res = await handleCreateRecipeRequest(t.request(), t.deps);
    await t.flush();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('Gemini 이미지 요청 실패 (402)');
    expect(t.postSlack).toHaveBeenCalledTimes(1);
  });

  it('요청 내용 문제(400)는 알리지 않는다', async () => {
    const t = setup(
      () =>
        new Response('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"bad"}}', {
          status: 400,
        })
    );
    const res = await handleCreateRecipeRequest(t.request(), t.deps);
    await t.flush();
    expect(res.status).toBe(500);
    expect(t.postSlack).not.toHaveBeenCalled();
  });
});

describe('handleCreateRecipeRequest (기존 흐름 유지)', () => {
  const base = () => ({
    getUserId: async () => 'u' as string | null,
    consume: async () => allowed,
    release: vi.fn(async () => {}),
    generate: vi.fn(async () => ({ id: 1 })),
  });
  const req = () =>
    new Request('https://x', {
      method: 'POST',
      body: '{"command":"c","week":2,"is_zero_carb":true}',
    });

  it('성공하면 200으로 생성 결과를 돌려준다', async () => {
    const deps = base();
    const res = await handleCreateRecipeRequest(req(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
    expect(deps.generate).toHaveBeenCalledWith({ command: 'c', week: 2, is_zero_carb: true });
  });

  it('로그인 정보가 없으면 500', async () => {
    const res = await handleCreateRecipeRequest(req(), { ...base(), getUserId: async () => null });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error: 로그인된 사용자 정보를 가져올 수 없습니다');
  });

  it('한도 초과면 생성 없이 429', async () => {
    const deps = { ...base(), consume: async () => ({ ...allowed, allowed: false, remaining: 0 }) };
    const res = await handleCreateRecipeRequest(req(), deps);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('QUOTA_EXCEEDED');
    expect(deps.generate).not.toHaveBeenCalled();
  });
});
