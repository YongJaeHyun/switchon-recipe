import { describe, expect, it } from 'vitest';
import type { AffiliateProduct } from 'types/affiliate';
import { groupAffiliateProducts, isHttpsUrl, MAX_PRODUCTS_PER_SLOT } from './affiliateProducts';

const product = (over: Partial<AffiliateProduct>): AffiliateProduct => ({
  id: 1,
  slot: 'shake',
  name: '쉐이크',
  description: null,
  url: 'https://link.coupang.com/a/abc',
  image_url: null,
  sort: 0,
  ...over,
});

describe('isHttpsUrl', () => {
  it('https 주소만 통과', () => {
    expect(isHttpsUrl('https://link.coupang.com/a/abc')).toBe(true);
    expect(isHttpsUrl('http://link.coupang.com/a/abc')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('intent://x')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
    expect(isHttpsUrl('https:// space.com')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl(null)).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

describe('groupAffiliateProducts', () => {
  it('slot별로 묶고 sort → id 순서', () => {
    const grouped = groupAffiliateProducts([
      product({ id: 3, slot: 'shake', sort: 1 }),
      product({ id: 2, slot: 'groceries', sort: 0 }),
      product({ id: 5, slot: 'shake', sort: 0 }),
      product({ id: 4, slot: 'shake', sort: 0 }),
    ]);
    expect(grouped.shake.map((p) => p.id)).toEqual([4, 5, 3]);
    expect(grouped.groceries.map((p) => p.id)).toEqual([2]);
  });

  it('slot마다 최대 4개', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((id) => product({ id, sort: id }));
    const grouped = groupAffiliateProducts(rows);
    expect(MAX_PRODUCTS_PER_SLOT).toBe(4);
    expect(grouped.shake.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('https가 아닌 링크와 모르는 slot은 뺀다 (뺀 뒤 4개를 채운다)', () => {
    const grouped = groupAffiliateProducts([
      product({ id: 1, url: 'http://x.com' }),
      product({ id: 2 }),
      product({ id: 3, slot: 'recipe' as never }),
      product({ id: 4, url: 'javascript:alert(1)' }),
      product({ id: 5 }),
    ]);
    expect(grouped.shake.map((p) => p.id)).toEqual([2, 5]);
    expect(grouped.groceries).toEqual([]);
  });

  it('비어 있으면 둘 다 빈 배열 (칩을 숨긴다)', () => {
    expect(groupAffiliateProducts([])).toEqual({ shake: [], groceries: [] });
    expect(groupAffiliateProducts(undefined)).toEqual({ shake: [], groceries: [] });
  });

  it('이미지 주소도 https만 쓰고 아니면 비운다', () => {
    const grouped = groupAffiliateProducts([
      product({ id: 1, image_url: 'http://img.com/a.jpg' }),
      product({ id: 2, image_url: 'https://img.com/b.jpg' }),
    ]);
    expect(grouped.shake.map((p) => p.image_url)).toEqual([null, 'https://img.com/b.jpg']);
  });
});
