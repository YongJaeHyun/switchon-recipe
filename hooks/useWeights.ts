import { useMutation } from '@tanstack/react-query';
import { UserSettingAPI, type UserSettingPatch } from 'api/UserSettingAPI';
import { WeightAPI } from 'api/WeightAPI';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useUserStore } from 'stores/userStore';
import type { UserSettingDB, WeightLogDB } from 'types/database';
import { failFastWhenOffline } from 'utils/failFastWhenOffline';
import { programWeightLoss } from 'utils/kakaoShare';
import type { WeightGoalState } from 'utils/weightGoal';
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

// 이번 회차 첫 체중 기록 대비 줄어든 kg (완주 인증 "감량한 체중도 함께 보내기"). 없거나 줄지 않았으면 null
export const useProgramWeightLoss = () => {
  const { logs } = useWeights();
  const startDate = useUserStore((state) => state.start_date);
  const programStart = useUserStore((state) => state.program_start);
  return programWeightLoss(logs, startDate, programStart);
};

// 체중 목표와 달성 기록. 열이 아직 없거나(마이그레이션 전) 읽기에 실패하면 status 'unknown' (화면은 목표 칸을 숨긴다)
export const useWeightGoal = () => {
  const uid = useUserStore((state) => state.id);

  const query = useQueryWith402Retry<WeightGoalState>({
    queryKey: [QueryKey.weightGoal, uid],
    queryFn: failFastWhenOffline(UserSettingAPI.getGoal),
    enabled: !!uid,
  });

  const { mutateAsync: saveGoal, isPending: isSavingGoal } = useMutation({
    mutationFn: UserSettingAPI.upsertGoal,
    onSuccess: (data) => {
      if (data) queryClient.setQueryData([QueryKey.weightGoal, uid], data);
    },
  });

  const goal = query.data;
  const status: 'none' | 'set' | 'unknown' = !query.isSuccess
    ? 'unknown'
    : goal?.weight_goal_kg != null
      ? 'set'
      : 'none';

  return { goal, status, saveGoal, isSavingGoal };
};
