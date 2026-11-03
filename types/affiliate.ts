// 재료 제휴 링크 (쿠팡 파트너스). 운영자가 서버(affiliate_product)에 넣은 제품만 보여준다
export type AffiliateSlot = 'shake' | 'groceries';

export interface AffiliateProduct {
  id: number;
  slot: AffiliateSlot;
  name: string;
  description: string | null;
  url: string;
  image_url: string | null;
  sort: number;
}
