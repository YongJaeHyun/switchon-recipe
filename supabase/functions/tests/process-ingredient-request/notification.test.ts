import { describe, expect, it } from 'vitest';
import { buildRequesterNotification } from '../../process-ingredient-request/core.ts';
import type { CandidateIngredient, ProcessReport } from '../../process-ingredient-request/types.ts';

const candidate = (name: string, isCarbohydrate = false): CandidateIngredient => ({
  name,
  week: 1,
  isCarbohydrate,
  subKeywords: [],
  imageQueryEn: 'x',
  reason: '',
});

const report = (overrides: Partial<ProcessReport>): ProcessReport => ({
  requestName: '닭다리살',
  status: 'added',
  reason: '근거',
  outcomes: [],
  ...overrides,
});

describe('buildRequesterNotification', () => {
  it('announces added ingredients and links non-carb additions to the zero-carb screen', () => {
    const n = buildRequesterNotification(
      report({
        outcomes: [
          { candidate: candidate('닭다리살'), status: 'added' },
          { candidate: candidate('닭안심'), status: 'added' },
          { candidate: candidate('닭날개'), status: 'failed', error: 'x' },
        ],
      })
    );
    expect(n?.title).toContain('닭다리살');
    expect(n?.body).toContain('닭안심');
    expect(n?.body).not.toContain('닭날개');
    expect(n?.href).toBe('/(tabs)/home/recipeCreation/zero');
  });

  it('links carbohydrate additions to the low-carb screen', () => {
    const n = buildRequesterNotification(
      report({
        requestName: '고구마',
        outcomes: [{ candidate: candidate('고구마', true), status: 'added' }],
      })
    );
    expect(n?.href).toBe('/(tabs)/home/recipeCreation/low');
  });

  it('explains a rejection with the reason', () => {
    const n = buildRequesterNotification(
      report({ requestName: '라면', status: 'rejected', reason: '정제 밀가루 금지 품목이에요.' })
    );
    expect(n?.body).toContain('라면');
    expect(n?.body).toContain('정제 밀가루 금지 품목이에요.');
    expect(n?.href).toBeNull();
  });

  it('points to the existing ingredient for a duplicate', () => {
    const n = buildRequesterNotification(
      report({ requestName: '치아시드', status: 'duplicate', matchedName: '치아씨드' })
    );
    expect(n?.body).toContain('치아씨드');
  });

  it('does not notify on failure', () => {
    expect(buildRequesterNotification(report({ status: 'failed', error: 'x' }))).toBeNull();
  });

  it('tells the requester when the same name was already reviewed', () => {
    const n = buildRequesterNotification(
      report({
        requestName: '꽈리고추',
        status: 'duplicate',
        reason: '이미 처리되었거나 처리 중인 요청',
      })
    );
    expect(n?.body).toContain('꽈리고추');
    expect(n?.body).toContain('이미 검토');
  });
});
