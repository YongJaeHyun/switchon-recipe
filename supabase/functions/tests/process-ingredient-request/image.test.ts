import { describe, expect, it } from 'vitest';
import {
  findIngredientImage,
  type ImageDeps,
  type PixabayHit,
} from '../../process-ingredient-request/image.ts';
import type { CandidateIngredient } from '../../process-ingredient-request/types.ts';

const candidate: CandidateIngredient = {
  name: '연어',
  week: 1,
  isCarbohydrate: false,
  subKeywords: [],
  imageQueryEn: 'raw salmon',
  reason: '',
};

const hit = (id: number): PixabayHit => ({
  id,
  largeImageURL: `https://pixabay/${id}.jpg`,
  webformatURL: `https://pixabay/${id}_640.jpg`,
  tags: '',
});

const bytesOf = (label: string) => new TextEncoder().encode(label);
const labelOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

interface FakeOptions {
  en?: PixabayHit[];
  ko?: PixabayHit[];
  passing?: string[];
  failingDownloads?: string[];
}

const createFakeDeps = ({ en = [], ko = [], passing = [], failingDownloads = [] }: FakeOptions) => {
  const calls = { search: [] as [string, string][], verify: [] as string[], generate: 0 };
  const deps: ImageDeps = {
    search: async (query, lang) => {
      calls.search.push([query, lang]);
      return lang === 'en' ? en : ko;
    },
    download: async (url) => {
      if (failingDownloads.includes(url)) throw new Error('download failed');
      return { bytes: bytesOf(url), mimeType: 'image/jpeg' };
    },
    verify: async (image) => {
      const label = labelOf(image.bytes);
      calls.verify.push(label);
      return { matches: passing.includes(label), reason: '' };
    },
    generate: async () => {
      calls.generate += 1;
      return { bytes: bytesOf(`generated-${calls.generate}`), mimeType: 'image/png' };
    },
  };
  return { deps, calls };
};

describe('findIngredientImage', () => {
  it('returns the first verified pixabay image without generating', async () => {
    const { deps, calls } = createFakeDeps({
      en: [hit(1), hit(2), hit(3)],
      passing: [hit(2).largeImageURL, hit(3).largeImageURL],
    });

    const result = await findIngredientImage(candidate, deps);

    expect(result?.source).toBe('pixabay');
    expect(labelOf(result!.bytes)).toBe(hit(2).largeImageURL);
    expect(calls.verify).toHaveLength(2);
    expect(calls.generate).toBe(0);
  });

  it('searches in korean when english has fewer than 3 hits', async () => {
    const { deps, calls } = createFakeDeps({
      en: [hit(1)],
      ko: [hit(2), hit(3)],
      passing: [hit(3).largeImageURL],
    });

    const result = await findIngredientImage(candidate, deps);

    expect(calls.search).toEqual([
      ['raw salmon', 'en'],
      ['연어', 'ko'],
    ]);
    expect(labelOf(result!.bytes)).toBe(hit(3).largeImageURL);
  });

  it('checks at most 5 pixabay candidates', async () => {
    const { deps, calls } = createFakeDeps({ en: [1, 2, 3, 4, 5, 6, 7, 8].map(hit) });

    await findIngredientImage(candidate, deps);

    expect(calls.verify.filter((label) => label.startsWith('https://pixabay'))).toHaveLength(5);
  });

  it('falls back to generation when all pixabay candidates fail', async () => {
    const { deps } = createFakeDeps({ en: [hit(1), hit(2), hit(3)], passing: ['generated-1'] });

    const result = await findIngredientImage(candidate, deps);

    expect(result).toMatchObject({ source: 'generated', mimeType: 'image/png' });
  });

  it('generates at most twice and returns null when everything fails', async () => {
    const { deps, calls } = createFakeDeps({ en: [hit(1), hit(2), hit(3)] });

    const result = await findIngredientImage(candidate, deps);

    expect(result).toBeNull();
    expect(calls.generate).toBe(2);
  });

  it('skips a candidate whose download fails and continues', async () => {
    const { deps } = createFakeDeps({
      en: [hit(1), hit(2), hit(3)],
      failingDownloads: [hit(1).largeImageURL],
      passing: [hit(2).largeImageURL],
    });

    const result = await findIngredientImage(candidate, deps);

    expect(labelOf(result!.bytes)).toBe(hit(2).largeImageURL);
  });

  it('dedupes hits returned by both searches', async () => {
    const { deps, calls } = createFakeDeps({ en: [hit(1)], ko: [hit(1), hit(2)] });

    await findIngredientImage(candidate, deps);

    expect(calls.verify.filter((label) => label === hit(1).largeImageURL)).toHaveLength(1);
  });
});
