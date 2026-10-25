import { describe, expect, it } from 'vitest';
import {
  contenders,
  ingredientSetOf,
  normalizeRecipeName,
  rankSimilar,
  scoreCandidates,
  similarityScore,
  type SimilarCandidate,
} from '../../_shared/similarRecipes.ts';

// 공백 제거 + "닭 가슴살" → "닭가슴살" 정도만 하는 가짜 정규화
const norm = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '');

const recipe = (o: Partial<SimilarCandidate> = {}): SimilarCandidate => ({
  id: 1,
  recipe_name: '레시피',
  ingredients: JSON.stringify([{ name: '두부' }]),
  cuisine: null,
  method: null,
  spicy: null,
  ...o,
});

const ing = (...names: string[]) => JSON.stringify(names.map((name) => ({ name })));

describe('ingredientSetOf', () => {
  it('옛 형식(문자열)과 새 형식({ name })을 모두 받고 정규화한다', () => {
    expect(
      ingredientSetOf(JSON.stringify(['닭 가슴살 (껍질 제거)', { name: '두부' }]), norm)
    ).toEqual(new Set(['닭가슴살', '두부']));
  });

  it('해석할 수 없으면 빈 집합, 모양을 모르는 항목은 건너뛴다', () => {
    expect(ingredientSetOf(null, norm)).toEqual(new Set());
    expect(ingredientSetOf('not json', norm)).toEqual(new Set());
    expect(ingredientSetOf('{"a":1}', norm)).toEqual(new Set());
    expect(ingredientSetOf(JSON.stringify(['두부', 3, { title: 'x' }, '']), norm)).toEqual(
      new Set(['두부'])
    );
  });
});

describe('normalizeRecipeName', () => {
  it('공백·대소문자를 무시한다', () => {
    expect(normalizeRecipeName(' 두부 Steak ')).toBe(normalizeRecipeName('두부steak'));
    expect(normalizeRecipeName(null)).toBe('');
  });
});

describe('similarityScore', () => {
  const s = (names: string[], tags: Partial<SimilarCandidate> = {}) => ({
    names: new Set(names),
    cuisine: tags.cuisine ?? null,
    method: tags.method ?? null,
    spicy: tags.spicy ?? null,
  });

  it('재료 Jaccard ×10', () => {
    // 교집합 1 / 합집합 3
    expect(similarityScore(s(['a', 'b']), s(['b', 'c']))).toBeCloseTo(10 / 3);
    expect(similarityScore(s(['a']), s(['a']))).toBe(10);
  });

  it('같은 종류 +2, 같은 방식 +1, 같은 맵기 +0.5 (둘 다 값이 있을 때만)', () => {
    const tags = { cuisine: 'korean', method: 'soup', spicy: false };
    expect(similarityScore(s(['a', 'b'], tags), s(['a', 'c'], tags))).toBeCloseTo(
      10 / 3 + 2 + 1 + 0.5
    );
    // 한쪽이 null이면 같은 것으로 보지 않는다
    expect(
      similarityScore(s(['a'], tags), s(['a'], { cuisine: null, method: null, spicy: null }))
    ).toBe(10);
    // 맵기 false끼리도 같은 것
    expect(similarityScore(s(['a'], { spicy: false }), s(['a'], { spicy: false }))).toBe(10.5);
    expect(similarityScore(s(['a'], { spicy: true }), s(['a'], { spicy: false }))).toBe(10);
  });

  it('공유 재료가 없으면 종류·방식이 둘 다 같을 때만 남는다', () => {
    expect(
      similarityScore(
        s(['a'], { cuisine: 'korean', method: 'soup', spicy: true }),
        s(['b'], {
          cuisine: 'korean',
          method: 'soup',
          spicy: true,
        })
      )
    ).toBe(3.5);
    expect(
      similarityScore(s(['a'], { cuisine: 'korean' }), s(['b'], { cuisine: 'korean' }))
    ).toBeNull();
    expect(
      similarityScore(
        s(['a'], { cuisine: 'korean', method: 'soup' }),
        s(['b'], {
          cuisine: 'korean',
          method: 'grill',
        })
      )
    ).toBeNull();
    expect(similarityScore(s([]), s([]))).toBeNull();
  });
});

describe('scoreCandidates', () => {
  it('자기 자신과 이름이 같은(정규화) 레시피, 조건에 못 미치는 후보는 뺀다', () => {
    const target = recipe({ id: 1, recipe_name: '두부 조림', ingredients: ing('두부', '간장') });
    const scored = scoreCandidates(
      target,
      [
        recipe({ id: 1, recipe_name: '두부 조림', ingredients: ing('두부', '간장') }),
        recipe({ id: 2, recipe_name: '두부조림', ingredients: ing('두부', '간장') }),
        recipe({ id: 3, recipe_name: '두부 스테이크', ingredients: ing('두부') }),
        recipe({ id: 4, recipe_name: '오이무침', ingredients: ing('오이') }),
      ],
      norm
    );
    expect(scored.map((r) => r.id)).toEqual([3]);
    expect(scored[0].score).toBeCloseTo(5);
  });

  it('정규화된 재료로 비교한다', () => {
    const target = recipe({ id: 1, recipe_name: 'a', ingredients: ing('닭 가슴살 (껍질 제거)') });
    const scored = scoreCandidates(
      target,
      [recipe({ id: 2, recipe_name: 'b', ingredients: JSON.stringify(['닭가슴살']) })],
      norm
    );
    expect(scored).toEqual([{ id: 2, score: 10 }]);
  });
});

describe('contenders', () => {
  it('limit번째 점수 이상인 후보를 모두 (동점 포함)', () => {
    const scored = [
      { id: 1, score: 5 },
      { id: 2, score: 3 },
      { id: 3, score: 3 },
      { id: 4, score: 3 },
      { id: 5, score: 1 },
    ];
    expect(contenders(scored, 2).map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect(contenders(scored, 10).map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(contenders([], 6)).toEqual([]);
  });
});

describe('rankSimilar', () => {
  it('점수 내림차순, 같으면 저장 수 내림차순, 그다음 id 내림차순으로 limit개', () => {
    const scored = [
      { id: 1, score: 3 },
      { id: 2, score: 3 },
      { id: 3, score: 3 },
      { id: 4, score: 9 },
      { id: 5, score: 1 },
    ];
    expect(rankSimilar(scored, { 1: 5, 2: 0, 3: 0 }, 4)).toEqual([4, 1, 3, 2]);
  });
});
