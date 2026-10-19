import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllPages,
  fileNameFromUri,
  findUnusedFiles,
} from '../../delete-unused-images/cleanup.ts';

describe('fileNameFromUri', () => {
  it('extracts the file name without query string', () => {
    expect(
      fileNameFromUri('https://x/storage/v1/object/public/recipe-images/recipe-1.jpg?t=1')
    ).toBe('recipe-1.jpg');
  });

  it('returns null for empty values', () => {
    expect(fileNameFromUri(null)).toBeNull();
    expect(fileNameFromUri('')).toBeNull();
  });
});

describe('findUnusedFiles', () => {
  it('keeps files referenced by any recipe', () => {
    expect(
      findUnusedFiles(['a.jpg', 'b.jpg', 'c.jpg'], ['https://x/a.jpg', null, 'https://x/c.jpg?v=2'])
    ).toEqual(['b.jpg']);
  });
});

describe('fetchAllPages', () => {
  it('reads every page, not just the first 1000 rows', async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => i);
    const fetchPage = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1));

    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(2345);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('stops after an empty page', async () => {
    const fetchPage = vi.fn(async () => []);
    expect(await fetchAllPages(fetchPage, 1000)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
