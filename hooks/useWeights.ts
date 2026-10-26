import { useMutation } from '@tanstack/react-query';
import { UserSettingAPI, type UserSettingPatch } from 'api/UserSettingAPI';
import { WeightAPI } from 'api/WeightAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import type { UserSettingDB, WeightLogDB } from 'types/database';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { useQueryWith402Retry } from './useCustomQuery';

// 내 체중 기록 전체 (날짜순). 무효화는 [QueryKey.weightLogs] 접두어로 한다
export const useWeights = () => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<WeightLogDB[]>({
    queryKey: [QueryKey.weightLogs, uid],
    queryFn: failFastWhenOffline(WeightAPI.list),
    enabled: !!uid,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKey.weightLogs] });

  const { mutateAsync: saveWeight, isPending: isSaving } = useMutation({
    mutationFn: WeightAPI.upsert,
    onSettled: invalidate,
  });

  const { mutateAsync: deleteWeight, isPending: isDeleting } = useMutation({
    mutationFn: WeightAPI.remove,
    onSettled: invalidate,
  });

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    // 목록을 제대로 받았는지 (실패·로딩 중이면 logs가 []여도 기록이 없다는 뜻이 아니다)
    isLogsFetched: query.isSuccess,
    saveWeight,
    deleteWeight,
    isSaving,
    isDeleting,
  };
};

// 서버에 저장하는 내 설정 (체중 알림 등). 행이 없으면 null
export const useUserSetting = () => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<UserSettingDB | null>({
    queryKey: [QueryKey.userSetting, uid],
    queryFn: failFastWhenOffline(UserSettingAPI.get),
    enabled: !!uid,
  });

  const { mutateAsync: updateSetting } = useMutation({
    mutationFn: (patch: UserSettingPatch) => UserSettingAPI.upsert(patch),
    onSuccess: (data) => {
      if (data) queryClient.setQueryData([QueryKey.userSetting, uid], data);
    },
  });

  return {
    setting: query.data,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    isError: query.isError,
    updateSetting,
  };
};
