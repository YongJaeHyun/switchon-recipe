import { useQuery } from '@tanstack/react-query';
import { AffiliateAPI } from 'api/AffiliateAPI';
import { QueryKey } from 'const/queryKey';
import { groupAffiliateProducts } from 'utils/affiliateProducts';

// 시작 전 준비 체크리스트의 [사러 가기]용 추천 제품 (slot별, 최대 4개).
// 못 불러오면 빈 목록 → 칩이 안 보인다 (오류 안내 없음)
export const useAffiliateProducts = () => {
  const { data } = useQuery({
    queryKey: [QueryKey.affiliateProducts],
    queryFn: AffiliateAPI.listProducts,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  return groupAffiliateProducts(data);
};
