import { describe, expect, it } from 'vitest';
import { searchKeywordOf, uniqueSearchKeywords } from './searchKeyword';

describe('searchKeywordOf', () => {
  it('괄호 속 부가 설명을 뺀다', () => {
    expect(searchKeywordOf('현미밥 (지은 밥)')).toBe('현미밥');
    expect(searchKeywordOf('소고기 (샤브샤브 또는 불고기용 얇은 부위)')).toBe('소고기');
    expect(searchKeywordOf('식용유 (코코넛 오일 또는 아보카도 오일)')).toBe('식용유');
  });

  it('전각 괄호, 가운데 괄호, 여러 개, 닫히지 않은 괄호', () => {
    expect(searchKeywordOf('파프리카（빨강/노랑）')).toBe('파프리카');
    expect(searchKeywordOf('두부 (부침용) 반 모 (약 150g)')).toBe('두부 반 모');
    expect(searchKeywordOf('고등어 (순살 필레')).toBe('고등어');
  });

  it('설명이 없으면 그대로, 공백 정리', () => {
    expect(searchKeywordOf('다진 마늘')).toBe('다진 마늘');
    expect(searchKeywordOf('  계란   ')).toBe('계란');
  });

  it('괄호 설명뿐이면 검색어가 없다', () => {
    expect(searchKeywordOf('(코코넛 오일 또는 아보카도 오일)')).toBe('');
  });
});

describe('uniqueSearchKeywords', () => {
  it('정리한 뒤 같은 말은 처음 것만 남긴다', () => {
    expect(
      uniqueSearchKeywords([
        '계란',
        '식용유 (코코넛 오일)',
        '식용유',
        '(아보카도 오일)',
        '현미밥 (지은 밥)',
      ])
    ).toEqual(['계란', '식용유', '현미밥']);
  });
});
