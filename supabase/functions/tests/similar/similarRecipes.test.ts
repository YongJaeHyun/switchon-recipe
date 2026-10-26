import { describe, expect, it } from 'vitest';
import {
  contenders,
  ingredientSetOf,
  isStopIngredient,
  rankSimilar,
  recipeNameKey,
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

describe('recipeNameKey 기본', () => {
  it('공백·대소문자를 무시한다', () => {
    expect(recipeNameKey(' 두부 Steak ')).toBe(recipeNameKey('두부steak'));
    expect(recipeNameKey(null)).toBe('');
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
    // 간장은 양념이라 비교에서 빠진다 → {두부} vs {두부}
    expect(scored[0].score).toBe(10);
  });

  it('정규화된 재료로 비교한다', () => {
    const target = recipe({ id: 1, recipe_name: 'a', ingredients: ing('닭 가슴살 (껍질 제거)') });
    const scored = scoreCandidates(
      target,
      [recipe({ id: 2, recipe_name: 'b', ingredients: JSON.stringify(['닭가슴살']) })],
      norm
    );
    expect(scored).toMatchObject([{ id: 2, score: 10 }]);
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

describe('양념 제외', () => {
  it('흔한 양념·기름·물은 제외어, 주재료는 아니다', () => {
    for (const n of [
      '소금',
      '후추',
      '간장',
      '참기름',
      '들기름',
      '올리브유',
      '식용유',
      '물',
      '깨',
      '식초',
      '고춧가루',
      '마늘',
      '대파',
    ])
      expect(isStopIngredient(n)).toBe(true);
    for (const n of ['계란', '두부', '닭가슴살', '양파', '된장', '김치', '고등어'])
      expect(isStopIngredient(n)).toBe(false);
  });

  it('양념만 겹치면 공유 재료로 보지 않는다 (Jaccard와 공유 재료 조건 모두)', () => {
    const target = recipe({ id: 1, recipe_name: 'a', ingredients: ing('고등어', '소금', '후추') });
    const scored = scoreCandidates(
      target,
      [
        recipe({ id: 2, recipe_name: 'b', ingredients: ing('계란', '소금', '후추') }),
        recipe({ id: 3, recipe_name: 'c', ingredients: ing('고등어', '참기름', '간장') }),
      ],
      norm
    );
    // 2는 공유 재료가 양념뿐이고 태그도 없어 빠진다. 3은 {고등어} vs {고등어}
    expect(scored).toMatchObject([{ id: 3, score: 10 }]);
  });
});

describe('recipeNameKey', () => {
  it('공백·문장부호·괄호 안 설명을 무시한다', () => {
    expect(recipeNameKey('저탄수 계란 간장밥 (스위치온 다이어트 1주차)')).toBe(
      recipeNameKey('저탄수 계란-간장밥!')
    );
    expect(recipeNameKey('두부 Steak')).toBe(recipeNameKey('두부steak'));
    expect(recipeNameKey('두부 스테이크')).not.toBe(recipeNameKey('두부 조림'));
  });

  it('기준 레시피와 이름 키가 같은 후보는 뺀다', () => {
    const target = recipe({ id: 1, recipe_name: '계란 간장밥', ingredients: ing('계란') });
    const scored = scoreCandidates(
      target,
      [
        recipe({ id: 2, recipe_name: '계란 간장밥 (1주차)', ingredients: ing('계란') }),
        recipe({ id: 3, recipe_name: '계란 볶음', ingredients: ing('계란') }),
      ],
      norm
    );
    expect(scored.map((r) => r.id)).toEqual([3]);
  });
});

describe('결과 안 중복 정리', () => {
  const tags = { cuisine: 'korean', method: 'grill', spicy: false };
  const target = recipe({
    id: 100,
    recipe_name: '기준',
    ingredients: ing('두부', '계란', '버섯'),
    ...tags,
  });

  it('이름 키가 같으면 순위가 높은 것만 남기고 다음 후보로 채운다', () => {
    const scored = scoreCandidates(
      target,
      [
        recipe({ id: 1, recipe_name: '두부 스테이크', ingredients: ing('두부', '계란'), ...tags }),
        recipe({
          id: 2,
          recipe_name: '두부스테이크 (저탄수)',
          ingredients: ing('두부', '계란', '양파'),
          ...tags,
        }),
        recipe({ id: 3, recipe_name: '버섯 구이', ingredients: ing('버섯'), ...tags }),
      ],
      norm
    );
    expect(rankSimilar(scored, {}, 2)).toEqual([1, 3]);
  });

  it('양념을 뺀 재료 집합과 종류·방식이 모두 같으면 중복 (이름이 달라도)', () => {
    const scored = scoreCandidates(
      target,
      [
        recipe({
          id: 1,
          recipe_name: '두부 계란 구이',
          ingredients: ing('두부', '계란', '소금'),
          ...tags,
        }),
        recipe({
          id: 2,
          recipe_name: '계란 두부 부침',
          ingredients: ing('계란', '두부', '간장'),
          ...tags,
        }),
        // 재료는 같지만 방식이 다르면 중복 아님
        recipe({
          id: 3,
          recipe_name: '두부 계란탕',
          ingredients: ing('두부', '계란'),
          ...tags,
          method: 'soup',
        }),
      ],
      norm
    );
    expect(rankSimilar(scored, { 1: 0, 2: 5 }, 6)).toEqual([2, 3]);
  });

  it('재료가 없거나 태그가 비면 재료 기준 중복으로 보지 않는다', () => {
    const scored = scoreCandidates(
      recipe({ id: 100, recipe_name: '기준', ingredients: ing('두부') }),
      [
        recipe({ id: 1, recipe_name: 'a', ingredients: ing('두부') }),
        recipe({ id: 2, recipe_name: 'b', ingredients: ing('두부') }),
      ],
      norm
    );
    expect(rankSimilar(scored, {}, 6)).toEqual([2, 1]);
  });
});
