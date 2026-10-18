import { IngredientRecord } from 'types/recipe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadIngredientCache, loadIngredientsWithCache } from './ingredientCache';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  },
}));

const record = (name: string): IngredientRecord => ({
  name,
  week: 1,
  image: `https://img/${name}.jpg`,
  source: 'seed',
  createdAt: '2026-01-01T00:00:00Z',
  sortOrder: 0,
});

const fresh = [record('계란'), record('두부')];
const cached = [record('캐시')];
const failing = async (): Promise<IngredientRecord[]> => {
  throw new Error('network');
};

describe('loadIngredientsWithCache', () => {
  beforeEach(() => storage.clear());

  it('returns fresh data and saves it', async () => {
    expect(await loadIngredientsWithCache(async () => fresh)).toEqual(fresh);
    expect(await loadIngredientCache()).toEqual(fresh);
  });

  it('returns the cache when the fetcher throws', async () => {
    await loadIngredientsWithCache(async () => cached);
    expect(await loadIngredientsWithCache(failing)).toEqual(cached);
  });

  it('rethrows when the fetcher throws and there is no cache', async () => {
    await expect(loadIngredientsWithCache(failing)).rejects.toThrow('network');
  });

  it('keeps a non-empty cache when the fetcher returns an empty list', async () => {
    await loadIngredientsWithCache(async () => cached);
    expect(await loadIngredientsWithCache(async () => [])).toEqual(cached);
    expect(await loadIngredientCache()).toEqual(cached);
  });
});
