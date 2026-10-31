import { describe, expect, it, vi } from 'vitest';
import {
  type AiUsageRow,
  createAiUsageInsert,
  extractAiUsage,
  observeAiUsage,
  withAiUsage,
} from '../../_shared/aiUsage.ts';

const GEMINI_TEXT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=secret';
const GEMINI_IMAGE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=secret';
const UID = '11111111-1111-4111-8111-111111111111';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// 일정(schedule)으로 받은 작업을 모아 두었다가 테스트에서 끝까지 기다린다
const collectSchedule = () => {
  const tasks: Promise<unknown>[] = [];
  return {
    schedule: (task: Promise<unknown>) => {
      tasks.push(task);
    },
    flush: () => Promise.all(tasks),
  };
};

describe('extractAiUsage: Gemini usageMetadata → 기록할 숫자', () => {
  it('텍스트 응답: 입력·출력·생각 토큰', () => {
    expect(
      extractAiUsage({
        candidates: [{ content: { parts: [{ text: '{}' }] } }],
        usageMetadata: {
          promptTokenCount: 1200,
          candidatesTokenCount: 800,
          thoughtsTokenCount: 450,
          totalTokenCount: 2450,
        },
      })
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 800,
      thinkingTokens: 450,
      imageTokens: 0,
      imageCount: 0,
    });
  });

  it('이미지 응답: 이미지 토큰은 출력에서 빼고 따로, 이미지 장수는 inlineData 수', () => {
    expect(
      extractAiUsage({
        candidates: [
          {
            content: {
              parts: [
                { text: '여기 있어요' },
                { inlineData: { mimeType: 'image/png', data: 'AAA' } },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 1300,
          totalTokenCount: 1320,
          candidatesTokensDetails: [
            { modality: 'TEXT', tokenCount: 10 },
            { modality: 'IMAGE', tokenCount: 1290 },
          ],
        },
      })
    ).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      thinkingTokens: 0,
      imageTokens: 1290,
      imageCount: 1,
    });
  });

  it('도구(구글 검색) 프롬프트 토큰은 입력에 더한다', () => {
    expect(
      extractAiUsage({
        usageMetadata: {
          promptTokenCount: 100,
          toolUsePromptTokenCount: 50,
          candidatesTokenCount: 5,
        },
      })
    ).toMatchObject({ inputTokens: 150, outputTokens: 5 });
  });

  it('빠진 필드·이상한 값은 0 (usageMetadata 없음, 숫자 아님, 음수)', () => {
    const zero = {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      imageTokens: 0,
      imageCount: 0,
    };
    expect(extractAiUsage(null)).toEqual(zero);
    expect(extractAiUsage('text')).toEqual(zero);
    expect(extractAiUsage({})).toEqual(zero);
    expect(extractAiUsage({ candidates: 'x', usageMetadata: 'x' })).toEqual(zero);
    expect(
      extractAiUsage({
        usageMetadata: {
          promptTokenCount: '12',
          candidatesTokenCount: -3,
          thoughtsTokenCount: Number.NaN,
          candidatesTokensDetails: [{ modality: 'IMAGE' }, null],
        },
      })
    ).toEqual(zero);
  });

  it('이미지 토큰 수가 출력 토큰보다 크게 와도 텍스트 출력은 0 아래로 내려가지 않는다', () => {
    expect(
      extractAiUsage({
        usageMetadata: {
          candidatesTokenCount: 100,
          candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }],
        },
      })
    ).toMatchObject({ outputTokens: 0, imageTokens: 1290 });
  });
});

describe('observeAiUsage: 응답 하나를 ai_usage 한 행으로', () => {
  it('성공 응답: 기능·uid·모델·토큰을 기록하고, 호출부는 본문을 그대로 읽는다', async () => {
    const insert = vi.fn(async (_row: AiUsageRow) => {});
    const { schedule, flush } = collectSchedule();
    const observe = observeAiUsage(insert, { feature: 'recipe_text', uid: UID }, schedule);

    const body = { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } };
    const res = json(body);
    observe(GEMINI_TEXT_URL, res);
    expect(await res.json()).toEqual(body);
    await flush();

    expect(insert).toHaveBeenCalledWith({
      uid: UID,
      feature: 'recipe_text',
      model: 'gemini-2.5-flash',
      input_tokens: 7,
      output_tokens: 3,
      thinking_tokens: 0,
      image_tokens: 0,
      image_count: 0,
      ok: true,
      status: 200,
    });
  });

  it('실패 응답도 ok=false·0토큰으로 남긴다 (본문은 읽지 않는다)', async () => {
    const insert = vi.fn(async (_row: AiUsageRow) => {});
    const { schedule, flush } = collectSchedule();
    const res = json({ error: { message: 'busy' } }, 503);
    observeAiUsage(insert, { feature: 'food_check' }, schedule)(GEMINI_TEXT_URL, res);
    expect(res.bodyUsed).toBe(false);
    await flush();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: null,
        feature: 'food_check',
        ok: false,
        status: 503,
        input_tokens: 0,
      })
    );
  });

  it('기능 이름을 모델로 고를 수 있다 (재료 이미지 확인·생성이 같은 콜백을 쓴다)', async () => {
    const insert = vi.fn(async (_row: AiUsageRow) => {});
    const { schedule, flush } = collectSchedule();
    const observe = observeAiUsage(
      insert,
      {
        feature: (model) =>
          model.includes('image') ? 'ingredient_image' : 'ingredient_image_check',
      },
      schedule
    );
    observe(GEMINI_IMAGE_URL, json({}));
    observe(GEMINI_TEXT_URL, json({}));
    await flush();
    expect(insert.mock.calls.map(([row]) => row.feature)).toEqual([
      'ingredient_image',
      'ingredient_image_check',
    ]);
  });

  it('Gemini가 아닌 URL(Pixabay 등)은 기록하지 않는다', async () => {
    const insert = vi.fn(async (_row: AiUsageRow) => {});
    const { schedule, flush } = collectSchedule();
    observeAiUsage(
      insert,
      { feature: 'ingredient_image' },
      schedule
    )('https://pixabay.com/api/?key=x', json({ hits: [] }));
    await flush();
    expect(insert).not.toHaveBeenCalled();
  });

  it('본문이 JSON이 아니어도 0토큰으로 기록하고 던지지 않는다', async () => {
    const insert = vi.fn(async (_row: AiUsageRow) => {});
    const { schedule, flush } = collectSchedule();
    observeAiUsage(
      insert,
      { feature: 'recipe_text' },
      schedule
    )(GEMINI_TEXT_URL, new Response('not json', { status: 200 }));
    await flush();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ok: true, input_tokens: 0 }));
  });

  it('기록(insert)이 실패해도 던지지 않고 로그만 남긴다', async () => {
    const log = vi.fn();
    const insert = vi.fn(async () => {
      throw new Error('db down');
    });
    const { schedule, flush } = collectSchedule();
    expect(() =>
      observeAiUsage(insert, { feature: 'recipe_text' }, schedule, log)(GEMINI_TEXT_URL, json({}))
    ).not.toThrow();
    await expect(flush()).resolves.toBeDefined();
    expect(log).toHaveBeenCalled();
  });

  it('응답 복제가 실패해도(이미 읽은 본문) 던지지 않는다', () => {
    const log = vi.fn();
    const res = json({});
    void res.text();
    expect(() =>
      observeAiUsage(vi.fn(), { feature: 'recipe_text' }, () => {}, log)(GEMINI_TEXT_URL, res)
    ).not.toThrow();
  });
});

describe('withAiUsage', () => {
  it('응답을 그대로 돌려주고, 응답마다 observer를 부른다', async () => {
    const res = json({ ok: 1 });
    const fetchFn = vi.fn(async () => res) as unknown as typeof fetch;
    const observe = vi.fn();
    const wrapped = withAiUsage(fetchFn, observe);

    expect(await wrapped(GEMINI_TEXT_URL, { method: 'POST' })).toBe(res);
    expect(fetchFn).toHaveBeenCalledWith(GEMINI_TEXT_URL, { method: 'POST' });
    expect(observe).toHaveBeenCalledWith(GEMINI_TEXT_URL, res);
  });

  it('observer가 던져도 응답은 그대로 돌려준다', async () => {
    const res = json({});
    const wrapped = withAiUsage((async () => res) as unknown as typeof fetch, () => {
      throw new Error('boom');
    });
    expect(await wrapped(new URL(GEMINI_TEXT_URL))).toBe(res);
  });

  it('fetch 예외(시간 초과 등)는 그대로 던지고 기록하지 않는다', async () => {
    const observe = vi.fn();
    const wrapped = withAiUsage(
      (async () => {
        throw new Error('timeout');
      }) as unknown as typeof fetch,
      observe
    );
    await expect(wrapped(GEMINI_TEXT_URL)).rejects.toThrow('timeout');
    expect(observe).not.toHaveBeenCalled();
  });
});

describe('createAiUsageInsert', () => {
  it('ai_usage에 한 행을 넣고, 오류면 던진다', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const client = { from: vi.fn(() => ({ insert: insertFn })) };
    const row: AiUsageRow = {
      uid: null,
      feature: 'recipe_tags',
      model: 'gemini-2.5-flash',
      input_tokens: 1,
      output_tokens: 2,
      thinking_tokens: 0,
      image_tokens: 0,
      image_count: 0,
      ok: true,
      status: 200,
    };
    await createAiUsageInsert(client)(row);
    expect(client.from).toHaveBeenCalledWith('ai_usage');
    expect(insertFn).toHaveBeenCalledWith(row);

    const failing = { from: () => ({ insert: async () => ({ error: { message: 'no table' } }) }) };
    await expect(createAiUsageInsert(failing)(row)).rejects.toThrow('no table');
  });
});
