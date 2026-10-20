import { PassAPI } from 'api/PassAPI';
import { QueryKey } from 'const/queryKey';
import { useUserStore } from 'stores/userStore';
import type { PassStatus } from 'types/pass';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

const STALE_TIME = 60 * 1000;

// 패스 상태(판매 구간, 만료일, 이용 가능 여부). 앱 판단은 표시용이고 서버가 최종 판단한다
export const usePass = (): {
  status: PassStatus | undefined;
  isLoading: boolean;
  refetch(): void;
} => {
  const uid = useUserStore((state) => state.id);

  const { data, isLoading, refetch } = useQueryWith402Retry<PassStatus>({
    // 계정이 바뀌면 다른 캐시를 쓴다. 무효화는 [QueryKey.pass] 접두어로 한다
    queryKey: [QueryKey.pass, uid],
    queryFn: failFastWhenOffline(PassAPI.getStatus),
    enabled: !!uid,
    staleTime: STALE_TIME,
  });

  return { status: data, isLoading, refetch: () => void refetch() };
};
