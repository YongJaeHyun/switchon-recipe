import { describe, expect, it } from 'vitest';
import {
  buildRequesterNotification,
  findHiddenIngredient,
  formatSlackReport,
  hiddenRejectionReport,
} from '../../process-ingredient-request/core.ts';
import {
  buildSlackMessage,
  markRestored,
  RESTORE_ACTION_ID,
} from '../../process-ingredient-request/slack.ts';
import type { ExistingIngredient } from '../../process-ingredient-request/types.ts';

const ingredient = (name: string, isActive: boolean, id: number): ExistingIngredient => ({
  id,
  name,
  subKeywords: [],
  week: 1,
  isCarbohydrate: false,
  isActive,
});

const existing = [ingredient('닭다리살', false, 7), ingredient('두부', true, 8)];

describe('findHiddenIngredient', () => {
  it('finds a hidden ingredient by exact (space-insensitive) name', () => {
    expect(findHiddenIngredient('닭 다리살', existing)?.id).toBe(7);
  });

  it('ignores active ingredients', () => {
    expect(findHiddenIngredient('두부', existing)).toBeNull();
  });

  it('finds a hidden ingredient by the name the AI matched as duplicate', () => {
    expect(findHiddenIngredient('닭다리살', existing)?.name).toBe('닭다리살');
  });
});

describe('hidden ingredient re-request', () => {
  const report = hiddenRejectionReport('닭 다리살', { id: 7, name: '닭다리살' });

  it('is reported as rejected with the hidden ingredient attached', () => {
    expect(report).toMatchObject({
      status: 'rejected',
      hiddenIngredient: { id: 7, name: '닭다리살' },
    });
  });

  it('tells the requester it was not added, without internal details', () => {
    const n = buildRequesterNotification(report);
    expect(n?.body).toContain("'닭 다리살'");
    expect(n?.body).toContain('추가되지 않았어요');
    expect(n?.body).not.toContain('숨');
    expect(n?.body).not.toContain('운영자');
  });

  it('is labeled as a hidden re-request for the operator', () => {
    expect(formatSlackReport(report)).toContain('🙈');
    expect(formatSlackReport(report)).toContain('닭다리살');
  });

  it('offers a restore button in Slack', () => {
    const { blocks } = buildSlackMessage(report);
    const buttons = blocks
      .flatMap((b) => (b.type === 'actions' ? b.elements : []))
      .filter((e: { action_id: string }) => e.action_id === RESTORE_ACTION_ID);
    expect(buttons.map((b: { value: string }) => b.value)).toEqual(['7']);
  });

  it('records the restore and removes the button', () => {
    const { blocks } = buildSlackMessage(report);
    const updated = markRestored(blocks, {
      ingredientId: 7,
      name: '닭다리살',
      userId: 'U9',
      at: new Date(),
    });
    const json = JSON.stringify(updated);
    expect(json).not.toContain(RESTORE_ACTION_ID);
    expect(json).toContain('다시 추가됨');
    expect(json).toContain('<@U9>');
  });
});
