import { describe, expect, it } from 'vitest';
import { flattenRecipePages } from './recipePages';

describe('flattenRecipePages', () => {
  it('페이지를 이어 붙이고, 페이지 사이에 새 레시피가 끼어 같은 레시피가 두 번 오면 한 번만', () => {
    const pages = [
      [{ id: 3 }, { id: 2 }],
      [{ id: 2 }, { id: 1 }],
    ];
    expect(flattenRecipePages(pages).map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it('페이지가 없으면 빈 배열', () => {
    expect(flattenRecipePages(undefined)).toEqual([]);
  });
});
