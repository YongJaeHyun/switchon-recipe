import { describe, expect, it } from 'vitest';
import { buildIngredientNormalizer } from '../../_shared/ingredientNormalize.ts';

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

  it('빈 키워드는 무시한다', () => {
    const n = buildIngredientNormalizer([{ name: '두부', sub_keywords: ['', ' '] }]);
    expect(n('양파')).toBe('양파');
  });
});
