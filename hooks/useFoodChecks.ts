import { FoodCheckAPI } from 'api/FoodCheckAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import type { FoodCheckRecord, PremiumQuotaStatus } from 'types/foodCheck';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

export const FOOD_CHECK_HISTORY_LIMIT = 20;
// signed URL이 1시간짜리라 그보다 짧게 둔다
const LIST_STALE_TIME = 5 * 60 * 1000;
const QUOTA_STALE_TIME = 30 * 1000;

// 최근 판정 기록 20개 (최신순). 무효화는 [QueryKey.foodChecks] 접두어로 한다
export const useFoodChecks = () => {
  const uid = useUserStore((state) => state.id);

  return useQueryWith402Retry<FoodCheckRecord[]>({
    queryKey: [QueryKey.foodChecks, uid, 'list'],
    queryFn: failFastWhenOffline(() => FoodCheckAPI.list({ limit: FOOD_CHECK_HISTORY_LIMIT })),
    enabled: !!uid,
    staleTime: LIST_STALE_TIME,
  });
};

const detailKey = (uid: string, id: number) => [QueryKey.foodChecks, uid, 'detail', id];

// 기록 하나. 방금 판정한 결과는 setFoodCheckDetail로 미리 넣어 두어 바로 보여준다
export const useFoodCheck = (id: number) => {
  const uid = useUserStore((state) => state.id);

  return useQueryWith402Retry<FoodCheckRecord | null>({
    queryKey: detailKey(uid, id),
    queryFn: failFastWhenOffline(() => FoodCheckAPI.get(id)),
    enabled: !!uid && Number.isFinite(id),
    staleTime: LIST_STALE_TIME,
  });
};

export const setFoodCheckDetail = (uid: string, record: FoodCheckRecord) => {
  queryClient.setQueryData(detailKey(uid, record.id), record);
};

// 오늘 판정 남은 횟수. 표시용이고 서버가 최종 판단한다. 실패하면 data가 없어 표시를 숨긴다
export const usePremiumQuota = () => {
  const uid = useUserStore((state) => state.id);

  return useQueryWith402Retry<PremiumQuotaStatus>({
    queryKey: [QueryKey.premiumQuota, uid, 'food_check'],
    queryFn: failFastWhenOffline(FoodCheckAPI.getQuota),
    enabled: !!uid,
    staleTime: QUOTA_STALE_TIME,
    retry: false,
  });
};
