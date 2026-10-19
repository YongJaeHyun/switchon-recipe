import { describe, expect, it, vi } from 'vitest';
import {
  buildSlackMessage,
  RESTORE_ACTION_ID,
  ROLLBACK_ACTION_ID,
} from '../../process-ingredient-request/slack.ts';
import { handleSlackAction, type SlackActionDeps } from '../../slack-ingredient-action/handler.ts';

const SECRET = 'secret';
const NOW = 1_800_000_000;

const sign = async (timestamp: string, body: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`)
  );
  return 'v0=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const { blocks } = buildSlackMessage({
  requestName: '닭다리살',
  status: 'added',
  reason: '',
  outcomes: [
    {
      candidate: {
        name: '닭다리살',
        week: 1,
        isCarbohydrate: false,
        subKeywords: [],
        imageQueryEn: '',
        reason: '',
      },
      status: 'added',
      imageUrl: 'u',
      imageSource: 'pixabay',
      ingredientId: 11,
    },
  ],
});

const formBody = (actionId: string, value: string) =>
  'payload=' +
  encodeURIComponent(
    JSON.stringify({
      type: 'block_actions',
      user: { id: 'U1' },
      response_url: 'https://hooks.slack.com/actions/x',
      message: { text: '원래 메시지', blocks },
      actions: [{ action_id: actionId, value }],
    })
  );

const deps = (overrides: Partial<SlackActionDeps> = {}): SlackActionDeps => ({
  signingSecret: SECRET,
  nowSec: () => NOW,
  setIngredientActive: vi.fn(async () => ({ name: '닭다리살' })),
  respond: vi.fn(async () => {}),
  ...overrides,
});

const request = async (body: string, ts = String(NOW)) => ({
  body,
  timestamp: ts,
  signature: await sign(ts, body),
});

describe('handleSlackAction', () => {
  it('rejects requests with a bad signature', async () => {
    const d = deps();
    const res = await handleSlackAction(d, {
      body: formBody(ROLLBACK_ACTION_ID, '11'),
      timestamp: String(NOW),
      signature: 'v0=bad',
    });
    expect(res.status).toBe(401);
    expect(d.setIngredientActive).not.toHaveBeenCalled();
  });

  it('hides the ingredient on rollback and updates the message', async () => {
    const d = deps();
    const res = await handleSlackAction(d, await request(formBody(ROLLBACK_ACTION_ID, '11')));

    expect(res.status).toBe(200);
    expect(d.setIngredientActive).toHaveBeenCalledWith(11, false);
    const [url, payload] = (d.respond as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/actions/x');
    expect(payload.replace_original).toBe(true);
    expect(JSON.stringify(payload.blocks)).toContain('롤백됨');
    expect(JSON.stringify(payload.blocks)).not.toContain(ROLLBACK_ACTION_ID);
  });

  it('shows the ingredient again on restore', async () => {
    const d = deps();
    await handleSlackAction(d, await request(formBody(RESTORE_ACTION_ID, '7')));
    expect(d.setIngredientActive).toHaveBeenCalledWith(7, true);
  });

  it('tells the operator when the ingredient no longer exists, without changing the buttons', async () => {
    const d = deps({ setIngredientActive: vi.fn(async () => null) });
    await handleSlackAction(d, await request(formBody(ROLLBACK_ACTION_ID, '99')));
    const [, payload] = (d.respond as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.replace_original).toBe(false);
    expect(payload.text).toContain('찾을 수 없');
  });

  it('ignores unknown actions and non-numeric values', async () => {
    const d = deps();
    expect((await handleSlackAction(d, await request(formBody('other', '1')))).status).toBe(200);
    expect(
      (await handleSlackAction(d, await request(formBody(ROLLBACK_ACTION_ID, 'abc')))).status
    ).toBe(200);
    expect(d.setIngredientActive).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed payload', async () => {
    expect((await handleSlackAction(deps(), await request('payload=%7Bbroken'))).status).toBe(400);
  });
});
