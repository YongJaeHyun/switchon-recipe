import { describe, expect, it } from 'vitest';
import { normalizeIngredientName } from './normalizeIngredientName';

describe('normalizeIngredientName', () => {
  it('removes all whitespace', () => {
    expect(normalizeIngredientName('  닭 다리살 ')).toBe('닭다리살');
  });
});
