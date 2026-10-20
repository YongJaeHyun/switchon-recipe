import { describe, expect, it } from 'vitest';
import {
  filterRecipes,
  mealKind,
  pickRecommendations,
  stepOf,
  type RecipeRow,
} from '../../_shared/recommend.ts';

const norm = (s: string) => s.replace(/\s+/g, '');

const row = (o: Partial<RecipeRow> = {}): RecipeRow => ({
  id: 1,
  week: 1,
  is_zero_carb: false,
  cooking_time: 10,
  ingredients: [{ name: '두부' }],
  spicy: false,
  cuisine: 'korean',
  method: 'soup',
  ...o,
});

describe('stepOf', () => {
  it('useTodos와 같은 매핑, 5주차+는 5', () => {
    expect(stepOf(1, 2)).toBe(1);
    expect(stepOf(1, 4)).toBe(2);
    expect(stepOf(2, 1)).toBe(3);
    expect(stepOf(4, 7)).toBe(5);
    expect(stepOf(7, 1)).toBe(5);
  });
});

describe('mealKind', () => {
  it('단계별 끼니 종류', () => {
    expect(mealKind(1, 'lunch')).toBe('shake');
    expect(mealKind(2, 'dinner')).toBe('shake');
    expect(mealKind(3, 'dinner')).toBe('zero');
    expect(mealKind(4, 'dinner')).toBe('zero');
    expect(mealKind(5, 'dinner')).toBe('low');
  });
});

describe('filterRecipes', () => {
  const ctx = { week: 2, day: 1 };
  it('유저 주차보다 높은 주차 레시피 제외', () => {
    const out = filterRecipes([row({ id: 1, week: 2 }), row({ id: 2, week: 3 })], {}, ctx, norm);
    expect(out.map((r) => r.id)).toEqual([1]);
  });
  it('4주차 초과 유저도 week 4까지만', () => {
    const out = filterRecipes([row({ id: 1, week: 4 }), row({ id: 2, week: 5 })], {}, { week: 7, day: 1 }, norm);
    expect(out.map((r) => r.id)).toEqual([1]);
  });
  it('zero 끼니는 무탄수만, low 끼니는 무탄수도 허용', () => {
    const rows = [row({ id: 1 }), row({ id: 2, is_zero_carb: true })];
    expect(filterRecipes(rows, { meal: 'dinner' }, { week: 3, day: 1 }, norm).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(rows, { meal: 'lunch' }, { week: 3, day: 1 }, norm).map((r) => r.id)).toEqual([1, 2]);
  });
  it('shake 끼니는 빈 배열', () => {
    expect(filterRecipes([row()], { meal: 'lunch' }, { week: 1, day: 1 }, norm)).toEqual([]);
  });
  it('태그 조건 지정 시 null 태그 제외, 조건 없으면 포함', () => {
    const r = row({ cuisine: null, spicy: null, method: null });
    expect(filterRecipes([r], { cuisine: 'korean' }, ctx, norm)).toEqual([]);
    expect(filterRecipes([r], { spicy: true }, ctx, norm)).toEqual([]);
    expect(filterRecipes([r], { method: 'soup' }, ctx, norm)).toEqual([]);
    expect(
      filterRecipes([r], { spicy: null, cuisine: null, method: null, maxMinutes: null, meal: null }, ctx, norm),
    ).toEqual([r]);
  });
  it('태그 일치 여부와 maxMinutes', () => {
    const rows = [row({ id: 1, cooking_time: 20, spicy: true }), row({ id: 2, cooking_time: 10 })];
    expect(filterRecipes(rows, { maxMinutes: 15 }, ctx, norm).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(rows, { spicy: false }, ctx, norm).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(rows, { cuisine: 'western' }, ctx, norm)).toEqual([]);
  });
  it('exclude는 정규화 후 일치하는 재료가 있으면 제외', () => {
    const r = row({ ingredients: [{ name: '닭 가슴살' }] });
    expect(filterRecipes([r], { exclude: ['닭가슴살'] }, ctx, norm)).toEqual([]);
  });
  it('mustInclude는 모두 포함해야 통과', () => {
    const r = row({ ingredients: [{ name: '두부' }, { name: '달 걀' }] });
    expect(filterRecipes([r], { mustInclude: ['두부', '달걀'] }, ctx, norm)).toEqual([r]);
    expect(filterRecipes([r], { mustInclude: ['두부', '버섯'] }, ctx, norm)).toEqual([]);
  });
});

describe('pickRecommendations', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  it('고정 random이면 결정적, 상한, 중복 없음', () => {
    const a = pickRecommendations(items, 5, () => 0.3);
    const b = pickRecommendations(items, 5, () => 0.3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('개수보다 적으면 전부', () => {
    expect(pickRecommendations([1, 2], 5, () => 0).sort()).toEqual([1, 2]);
  });
});
