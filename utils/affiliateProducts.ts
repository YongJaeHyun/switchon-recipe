import type { AffiliateProduct, AffiliateSlot } from 'types/affiliate';

export const MAX_PRODUCTS_PER_SLOT = 4;
const SLOTS: AffiliateSlot[] = ['shake', 'groceries'];

// 서버 값이라도 https 주소만 연다 (javascript:, intent:, http 등은 버린다)
export const isHttpsUrl = (url: string | null | undefined): url is string =>
  typeof url === 'string' && /^https:\/\/[^\s/]+\S*$/.test(url);

// 준비 체크리스트 자리(slot)별 추천 제품: 링크가 https인 것만, sort → id 순서, 최대 4개
export const groupAffiliateProducts = (
  rows: AffiliateProduct[] | undefined
): Record<AffiliateSlot, AffiliateProduct[]> => {
  const grouped: Record<AffiliateSlot, AffiliateProduct[]> = { shake: [], groceries: [] };
  const sorted = [...(rows ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id);
  for (const row of sorted) {
    if (!SLOTS.includes(row.slot) || !isHttpsUrl(row.url)) continue;
    const list = grouped[row.slot];
    if (list.length >= MAX_PRODUCTS_PER_SLOT) continue;
    list.push({ ...row, image_url: isHttpsUrl(row.image_url) ? row.image_url : null });
  }
  return grouped;
};
