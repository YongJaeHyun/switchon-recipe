import { supabase } from 'lib/supabase';
import type { AffiliateProduct } from 'types/affiliate';

// 추천 제품 (RLS가 active인 것만 보여준다). 표시용이라 실패하면 throw만 하고 Sentry는 보내지 않는다 (칩을 숨긴다)
const listProducts = async (): Promise<AffiliateProduct[]> => {
  const { data, error } = await supabase
    .from('affiliate_product')
    .select('id, slot, name, description, url, image_url, sort')
    .order('sort')
    .order('id');
  if (error) throw error;
  return data as AffiliateProduct[];
};

// [쿠팡에서 보기]를 누른 기록. 실패해도 링크는 열어야 하니 오류를 삼킨다
const logClick = async (product: Pick<AffiliateProduct, 'id' | 'slot'>): Promise<void> => {
  try {
    await supabase.from('affiliate_click').insert({ product_id: product.id, slot: product.slot });
  } catch {
    // 표시·집계용이라 무시
  }
};

export const AffiliateAPI = {
  listProducts,
  logClick,
};
