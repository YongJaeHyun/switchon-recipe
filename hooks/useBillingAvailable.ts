import { useQuery } from '@tanstack/react-query';
import { QueryKey } from 'const/queryKey';
import { isBillingAvailable } from 'services/billing';

// 이 바이너리에서 Google Play 결제를 쓸 수 있는지 (앱 프로세스에서 한 번만 확인하고 캐시).
// 결제 모듈이 없는 빌드면 false → 패스 진입점을 숨긴다. 확인 전에는 undefined
export const useBillingAvailable = (): boolean | undefined => {
  const { data } = useQuery({
    queryKey: [QueryKey.billingAvailable],
    queryFn: isBillingAvailable, // throw하지 않는다
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return data;
};
