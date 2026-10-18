import { describe, expect, it } from 'vitest';
import {
  decideFinalStatus,
  findExactMatch,
  formatSlackReport,
  getProcessMode,
  JudgementParseError,
  normalizeName,
  parseJudgement,
} from '../../process-ingredient-request/core.ts';
import type {
  CandidateIngredient,
  ExistingIngredient,
  IngredientOutcome,
  RequestRecord,
  RequestStatus,
  Week,
} from '../../process-ingredient-request/types.ts';

const ingredient = (
  name: string,
  overrides: Partial<ExistingIngredient> = {}
): ExistingIngredient => ({
  name,
  subKeywords: [],
  week: 1,
  isCarbohydrate: false,
  isActive: true,
  ...overrides,
});

const candidate = (name: string, week: number = 1): CandidateIngredient => ({
  name,
  week: week as Week,
  isCarbohydrate: false,
  subKeywords: [],
  imageQueryEn: 'x',
  reason: 'r',
});

describe('normalizeName', () => {
  it('removes all whitespace', () => {
    expect(normalizeName('  닭 다리살 ')).toBe('닭다리살');
  });
});

describe('findExactMatch', () => {
  const existing = [
    ingredient('시오콘부', { subKeywords: ['염장다시마'], week: 3 }),
    ingredient('숨김재료', { isActive: false }),
  ];

  it('matches by name ignoring spaces', () => {
    expect(findExactMatch('시오 콘부', existing)?.name).toBe('시오콘부');
  });

  it('matches by subKeyword', () => {
    expect(findExactMatch('염장다시마', existing)?.name).toBe('시오콘부');
  });

  it('matches inactive ingredients', () => {
    expect(findExactMatch('숨김재료', existing)?.name).toBe('숨김재료');
  });

  it('returns null when absent', () => {
    expect(findExactMatch('치아씨드', existing)).toBeNull();
  });
});

describe('getProcessMode', () => {
  const rec = (status: RequestStatus): RequestRecord => ({
    id: 1,
    name: 'a',
    normalized_name: 'a',
    status,
    created_at: '',
  });

  it('returns new on pending insert', () => {
    expect(getProcessMode({ type: 'INSERT', record: rec('pending'), old_record: null })).toBe(
      'new'
    );
  });

  it('returns retry when operator resets to pending', () => {
    expect(
      getProcessMode({ type: 'UPDATE', record: rec('pending'), old_record: rec('rejected') })
    ).toBe('retry');
  });

  it('ignores its own status updates', () => {
    expect(
      getProcessMode({ type: 'UPDATE', record: rec('added'), old_record: rec('pending') })
    ).toBeNull();
  });

  it('ignores pending to pending updates', () => {
    expect(
      getProcessMode({ type: 'UPDATE', record: rec('pending'), old_record: rec('pending') })
    ).toBeNull();
  });

  it('ignores deletes', () => {
    expect(getProcessMode({ type: 'DELETE', record: null, old_record: rec('pending') })).toBeNull();
  });

  it('ignores non-pending inserts', () => {
    expect(getProcessMode({ type: 'INSERT', record: rec('added'), old_record: null })).toBeNull();
  });
});

describe('parseJudgement', () => {
  const existing = [ingredient('닭고기')];
  const add = (ingredients: unknown[]) =>
    JSON.stringify({ decision: 'add', reason: 'r', ingredients });

  it('parses fenced json', () => {
    const text = '설명입니다\n```json\n' + add([candidate('닭다리살')]) + '\n```';
    expect(parseJudgement(text, existing).decision).toBe('add');
  });

  it('parses raw json', () => {
    expect(parseJudgement(add([candidate('닭다리살')]), existing)).toMatchObject({
      decision: 'add',
      ingredients: [{ name: '닭다리살' }],
    });
  });

  it('drops candidates matching existing ingredients', () => {
    expect(
      parseJudgement(add([candidate('닭다리살'), candidate('닭 고기')]), existing)
    ).toMatchObject({ ingredients: [{ name: '닭다리살' }] });
  });

  it('turns add with only existing candidates into duplicate', () => {
    expect(parseJudgement(add([candidate('닭고기')]), existing)).toMatchObject({
      decision: 'duplicate',
      matchedName: '닭고기',
    });
  });

  it('keeps at most 4 candidates', () => {
    const judgement = parseJudgement(
      add(['가', '나', '다', '라', '마'].map((n) => candidate(n))),
      existing
    );
    expect(judgement.decision === 'add' && judgement.ingredients).toHaveLength(4);
  });

  it('dedupes candidates within the response', () => {
    const judgement = parseJudgement(
      add([candidate('닭다리살'), candidate('닭 다리살')]),
      existing
    );
    expect(judgement.decision === 'add' && judgement.ingredients).toHaveLength(1);
  });

  it('fills missing subKeywords and trims names', () => {
    const { subKeywords: _, ...noKeywords } = candidate(' 연어 ');
    expect(parseJudgement(add([noKeywords]), existing)).toMatchObject({
      ingredients: [{ name: '연어', subKeywords: [] }],
    });
  });

  it('rejects week out of range', () => {
    expect(() => parseJudgement(add([candidate('x', 4)]), existing)).toThrow(JudgementParseError);
  });

  it('rejects non-json', () => {
    expect(() => parseJudgement('모르겠어요', existing)).toThrow(JudgementParseError);
  });

  it('rejects unknown decision', () => {
    expect(() => parseJudgement('{"decision":"maybe","reason":"r"}', existing)).toThrow(
      JudgementParseError
    );
  });

  it('parses reject', () => {
    expect(parseJudgement('{"decision":"reject","reason":"금지 품목"}', existing)).toEqual({
      decision: 'reject',
      reason: '금지 품목',
    });
  });

  it('parses duplicate', () => {
    expect(
      parseJudgement('{"decision":"duplicate","reason":"r","matchedName":"닭고기"}', existing)
    ).toEqual({ decision: 'duplicate', reason: 'r', matchedName: '닭고기' });
  });
});

describe('decideFinalStatus', () => {
  const outcome = (status: 'added' | 'failed'): IngredientOutcome => ({
    candidate: candidate('a'),
    status,
  });

  it('is added if any ingredient was added', () => {
    expect(decideFinalStatus([outcome('failed'), outcome('added')])).toBe('added');
  });

  it('is failed if none were added', () => {
    expect(decideFinalStatus([outcome('failed')])).toBe('failed');
  });

  it('is failed if there are no outcomes', () => {
    expect(decideFinalStatus([])).toBe('failed');
  });
});

describe('formatSlackReport', () => {
  it('lists added ingredient details', () => {
    const text = formatSlackReport({
      requestName: '닭다리살',
      status: 'added',
      reason: '근거',
      outcomes: [
        {
          candidate: { ...candidate('닭다리살'), reason: '단백질' },
          status: 'added',
          imageUrl: 'https://x/a.jpg',
          imageSource: 'generated',
        },
      ],
    });
    for (const s of ['닭다리살', '1주차', 'https://x/a.jpg', 'AI 생성', '근거']) {
      expect(text).toContain(s);
    }
  });

  it('shows failed outcome errors', () => {
    const text = formatSlackReport({
      requestName: 'a',
      status: 'failed',
      reason: '',
      outcomes: [{ candidate: candidate('a'), status: 'failed', error: '맞는 이미지 없음' }],
    });
    expect(text).toContain('맞는 이미지 없음');
  });

  it('shows the matched name for duplicates', () => {
    const text = formatSlackReport({
      requestName: '고기',
      status: 'duplicate',
      reason: 'r',
      matchedName: '소고기',
      outcomes: [],
    });
    expect(text).toContain('소고기');
  });

  it('shows the error for failed requests', () => {
    const text = formatSlackReport({
      requestName: 'a',
      status: 'failed',
      reason: '',
      outcomes: [],
      error: 'Gemini 503',
    });
    expect(text).toContain('Gemini 503');
  });
});
