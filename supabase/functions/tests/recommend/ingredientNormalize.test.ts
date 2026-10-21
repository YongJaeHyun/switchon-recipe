import { describe, expect, it } from 'vitest';
import {
  buildIngredientNormalizer,
  excludeByContainment,
} from '../../_shared/ingredientNormalize.ts';
import type { RecipeRow } from '../../_shared/recommend.ts';

const normalize = buildIngredientNormalizer([
  { name: '닭가슴살', sub_keywords: ['닭 가슴살', '치킨브레스트'] },
  { name: '돼지', sub_keywords: [] },
  { name: '돼지목살', sub_keywords: ['목살'] },
  { name: '마늘', sub_keywords: [] },
]);

describe('buildIngredientNormalizer', () => {
  it('괄호 설명을 떼고 등록 이름으로 맞춘다', () => {
    expect(normalize('닭가슴살 (껍질 제거)')).toBe('닭가슴살');
  });

  it('띄어쓰기가 달라도 등록 이름으로 맞춘다', () => {
    expect(normalize('닭 가슴살')).toBe('닭가슴살');
  });

  it('sub_keyword로도 맞춘다', () => {
    expect(normalize('치킨 브레스트 100g')).toBe('닭가슴살');
  });

  it('가장 긴 이름이 이긴다', () => {
    expect(normalize('돼지목살 구이용')).toBe('돼지목살');
    expect(normalize('돼지 앞다리')).toBe('돼지');
  });

  it('부분 문자열로 맞춘다', () => {
    expect(normalize('다진 마늘')).toBe('마늘');
  });

  it('모르는 이름은 괄호·공백만 떼고 돌려준다', () => {
    expect(normalize(' 올리브 오일 (엑스트라 버진) ')).toBe('올리브오일');
  });

  it('영문은 소문자로 맞춘다', () => {
    const n = buildIngredientNormalizer([{ name: 'MCT오일', sub_keywords: ['MCT Oil'] }]);
    expect(n('mct oil')).toBe('mct오일');
    expect(n('Olive OIL')).toBe('oliveoil');
  });

  it('한 글자 등록 키는 더 긴 미등록 이름을 잡지 않는다 (정확히 같을 때만)', () => {
    const n = buildIngredientNormalizer([
      { name: '파', sub_keywords: [] },
      { name: '대파', sub_keywords: ['파'] },
    ]);
    expect(n('양파')).toBe('양파');
    expect(n('양파 1/2개')).toBe('양파1/2개');
    expect(n('대파 (흰 부분)')).toBe('대파');
    expect(n('파')).not.toBe('양파');
  });

  it('빈 키워드는 무시한다', () => {
    const n = buildIngredientNormalizer([{ name: '두부', sub_keywords: ['', ' '] }]);
    expect(n('양파')).toBe('양파');
  });
});

describe('excludeByContainment', () => {
  const registry = [
    { name: '닭가슴살', sub_keywords: ['닭 가슴살'] },
    { name: '돼지', sub_keywords: [] },
    { name: '돼지목살', sub_keywords: ['목살'] },
    { name: '마늘', sub_keywords: [] },
    { name: '고추장', sub_keywords: ['고추 장'] },
    { name: '두부', sub_keywords: [] },
  ];
  const row = (id: number, ...names: string[]): RecipeRow => ({
    id,
    week: 1,
    is_zero_carb: true,
    cooking_time: 10,
    ingredients: names.map((name) => ({ name })),
    spicy: false,
    cuisine: 'korean',
    method: 'soup',
  });
  const ids = (rows: RecipeRow[]) => rows.map((r) => r.id);

  it('(a) 복합 이름도 포함되면 뺀다: 소시지 → "닭가슴살 소시지"', () => {
    const rows = [row(1, '닭가슴살 소시지'), row(2, '두부')];
    expect(ids(excludeByContainment(rows, ['소시지'], registry))).toEqual([2]);
  });

  it('(b) 괄호 안 재료도 본다: 고추장 → "양념장 (고추장, 마늘)"', () => {
    const rows = [row(1, '양념장 (고추장, 마늘)'), row(2, '두부')];
    expect(ids(excludeByContainment(rows, ['고추장'], registry))).toEqual([2]);
  });

  it('(c) 상위 재료를 빼면 하위도 빠진다', () => {
    const rows = [row(1, '돼지목살'), row(2, '닭가슴살'), row(3, '두부')];
    expect(ids(excludeByContainment(rows, ['돼지'], registry))).toEqual([2, 3]);
    // 한 글자 제외어(닭)는 포함 비교를 하지 않으므로, 등록 가족(sub_keyword 닭)으로 맞춰질 때만 하위가 빠진다
    const withChicken = [{ name: '닭가슴살', sub_keywords: ['닭'] }, ...registry];
    expect(ids(excludeByContainment(rows, ['닭'], withChicken))).toEqual([1, 3]);
    expect(ids(excludeByContainment(rows, ['닭'], registry))).toEqual([1, 2, 3]);
  });

  it('등록 재료의 sub_keyword 표기도 잡는다 (띄어쓰기·대소문자 무시)', () => {
    const rows = [row(1, '닭 가슴살 100g'), row(2, '고추 장 1큰술'), row(3, '두부')];
    expect(ids(excludeByContainment(rows, ['닭가슴살', '고추장'], registry))).toEqual([3]);
    expect(ids(excludeByContainment([row(4, 'Bacon 2장')], ['bacon'], registry))).toEqual([]);
  });

  it('포함되지 않으면 남긴다: 마늘 제외해도 두부는 그대로', () => {
    const rows = [row(1, '두부'), row(2, '다진 마늘')];
    expect(ids(excludeByContainment(rows, ['마늘'], registry))).toEqual([1]);
  });

  it('빈 제외어는 무시한다', () => {
    const rows = [row(1, '두부')];
    expect(ids(excludeByContainment(rows, ['', ' ', '()'], registry))).toEqual([1]);
  });

  it('한 글자 제외어는 포함 여부로 쓰지 않는다: 파 → 양파·파프리카 유지, "파"만 뺀다', () => {
    const rows = [row(1, '양파'), row(2, '파프리카'), row(3, '파'), row(4, '김치'), row(5, '소금')];
    expect(ids(excludeByContainment(rows, ['파', '김', '소'], registry))).toEqual([1, 2, 4, 5]);
  });

  it('한 글자 sub_keyword는 키로 쓰지 않는다: 대파(sub 파) 제외해도 양파 유지', () => {
    const reg = [{ name: '대파', sub_keywords: ['파', '대 파'] }];
    const rows = [row(1, '양파'), row(2, '대파 1대'), row(3, '대 파')];
    expect(ids(excludeByContainment(rows, ['대파'], reg))).toEqual([1]);
  });

  it('한 글자 제외어도 등록 가족의 두 글자 이상 키로는 거른다', () => {
    const reg = [{ name: '대파', sub_keywords: ['파'] }];
    const rows = [row(1, '양파'), row(2, '대파 1대')];
    expect(ids(excludeByContainment(rows, ['파'], reg))).toEqual([1]);
  });

  it('상위 재료를 빼면 하위 재료의 sub_keyword 표기도 빠진다: 돼지 → "목살 200g"', () => {
    const rows = [row(1, '목살 200g'), row(2, '두부')];
    expect(ids(excludeByContainment(rows, ['돼지'], registry))).toEqual([2]);
  });
});
