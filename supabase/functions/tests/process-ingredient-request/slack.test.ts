import { describe, expect, it } from 'vitest';
import {
  buildSlackMessage,
  markRolledBack,
  ROLLBACK_ACTION_ID,
  verifySlackSignature,
} from '../../process-ingredient-request/slack.ts';
import type { CandidateIngredient, ProcessReport } from '../../process-ingredient-request/types.ts';

const SECRET = 'test-signing-secret';

const sign = async (timestamp: string, body: string, secret = SECRET) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
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

describe('verifySlackSignature', () => {
  const now = 1_800_000_000;
  const body = 'payload=%7B%7D';

  it('accepts a valid recent signature', async () => {
    const ts = String(now - 10);
    expect(
      await verifySlackSignature({
        body,
        timestamp: ts,
        signature: await sign(ts, body),
        secret: SECRET,
        nowSec: now,
      })
    ).toBe(true);
  });

  it('rejects a wrong signature', async () => {
    const ts = String(now);
    expect(
      await verifySlackSignature({
        body,
        timestamp: ts,
        signature: await sign(ts, body, 'other'),
        secret: SECRET,
        nowSec: now,
      })
    ).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const ts = String(now);
    expect(
      await verifySlackSignature({
        body: body + 'x',
        timestamp: ts,
        signature: await sign(ts, body),
        secret: SECRET,
        nowSec: now,
      })
    ).toBe(false);
  });

  it('rejects requests older than 5 minutes', async () => {
    const ts = String(now - 301);
    expect(
      await verifySlackSignature({
        body,
        timestamp: ts,
        signature: await sign(ts, body),
        secret: SECRET,
        nowSec: now,
      })
    ).toBe(false);
  });

  it('rejects missing headers', async () => {
    expect(
      await verifySlackSignature({
        body,
        timestamp: null,
        signature: null,
        secret: SECRET,
        nowSec: now,
      })
    ).toBe(false);
  });
});

const candidate = (name: string): CandidateIngredient => ({
  name,
  week: 1,
  isCarbohydrate: false,
  subKeywords: [],
  imageQueryEn: 'x',
  reason: '',
});

const addedReport: ProcessReport = {
  requestName: '닭다리살',
  status: 'added',
  reason: '근거',
  outcomes: [
    {
      candidate: candidate('닭다리살'),
      status: 'added',
      imageUrl: 'https://x/a.jpg',
      imageSource: 'pixabay',
      ingredientId: 11,
    },
    {
      candidate: candidate('닭안심'),
      status: 'added',
      imageUrl: 'https://x/b.jpg',
      imageSource: 'generated',
      ingredientId: 12,
    },
    { candidate: candidate('닭날개'), status: 'failed', error: '맞는 이미지 없음' },
  ],
};

type Block = { type: string; elements?: { action_id?: string; value?: string }[] };
const rollbackButtons = (blocks: Block[]) =>
  blocks
    .flatMap((b) => (b.type === 'actions' ? (b.elements ?? []) : []))
    .filter((e) => e.action_id === ROLLBACK_ACTION_ID);

describe('buildSlackMessage', () => {
  it('adds one rollback button per added ingredient with a confirm dialog', () => {
    const { text, blocks } = buildSlackMessage(addedReport);
    expect(text).toContain('닭다리살');
    const buttons = rollbackButtons(blocks as Block[]);
    expect(buttons.map((b) => b.value)).toEqual(['11', '12']);
    expect(JSON.stringify(buttons[0])).toContain('confirm');
  });

  it('has no buttons when nothing was added', () => {
    const { blocks } = buildSlackMessage({
      requestName: '라면',
      status: 'rejected',
      reason: 'r',
      outcomes: [],
    });
    expect(rollbackButtons(blocks as Block[])).toHaveLength(0);
  });
});

describe('markRolledBack', () => {
  it('removes only that button and records who rolled it back', () => {
    const { blocks } = buildSlackMessage(addedReport);
    const updated = markRolledBack(blocks, {
      ingredientId: 11,
      name: '닭다리살',
      userId: 'U123',
      at: new Date('2026-10-20T03:00:00Z'),
    });

    expect(rollbackButtons(updated as Block[]).map((b) => b.value)).toEqual(['12']);
    const json = JSON.stringify(updated);
    expect(json).toContain('↩️');
    expect(json).toContain('닭다리살');
    expect(json).toContain('<@U123>');
  });

  it('is idempotent when the button is already gone', () => {
    const { blocks } = buildSlackMessage(addedReport);
    const once = markRolledBack(blocks, {
      ingredientId: 11,
      name: '닭다리살',
      userId: 'U1',
      at: new Date(),
    });
    const twice = markRolledBack(once, {
      ingredientId: 11,
      name: '닭다리살',
      userId: 'U1',
      at: new Date(),
    });
    expect(JSON.stringify(twice).match(/↩️/g)?.length).toBe(
      JSON.stringify(once).match(/↩️/g)?.length
    );
  });
});
