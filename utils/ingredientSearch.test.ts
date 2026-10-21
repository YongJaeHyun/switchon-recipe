import { describe, expect, it } from 'vitest';
import { searchIngredients } from './ingredientSearch';

const list = [{ name: '닭가슴살', subKeywords: ['닭'] }, { name: '두부' }, { name: '양파' }];

describe('searchIngredients', () => {
  it('빈 검색어면 그대로', () => {
    expect(searchIngredients(list, '  ')).toBe(list);
  });

  it('완성형 한글은 이름·하위 키워드 포함', () => {
    expect(searchIngredients(list, '가슴').map((i) => i.name)).toEqual(['닭가슴살']);
    expect(searchIngredients(list, '닭').map((i) => i.name)).toEqual(['닭가슴살']);
  });

  it('초성 검색', () => {
    expect(searchIngredients(list, 'ㄷㅂ').map((i) => i.name)).toEqual(['두부']);
    expect(searchIngredients(list, 'ㅇ').map((i) => i.name)).toEqual(['양파']);
  });
});
