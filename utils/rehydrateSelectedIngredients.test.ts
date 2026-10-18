import { Ingredient } from 'types/recipe';
import { describe, expect, it } from 'vitest';
import { rehydrateSelectedIngredients } from './rehydrateSelectedIngredients';

const all: Ingredient[] = [
  { name: '계란', week: 1, image: 'https://img/egg.jpg' },
  { name: '두부', week: 1, image: 'https://img/tofu.jpg' },
];

describe('rehydrateSelectedIngredients', () => {
  it('replaces the saved image with the current one by name', () => {
    const saved = [{ name: '계란', week: 1, image: 12 as unknown as string }];
    expect(rehydrateSelectedIngredients(saved, all)).toEqual([all[0]]);
  });

  it('drops ingredients that no longer exist', () => {
    expect(rehydrateSelectedIngredients([{ name: '숨김재료' }, { name: '두부' }], all)).toEqual([
      all[1],
    ]);
  });

  it('keeps the saved order', () => {
    expect(
      rehydrateSelectedIngredients([{ name: '두부' }, { name: '계란' }], all).map((i) => i.name)
    ).toEqual(['두부', '계란']);
  });
});
