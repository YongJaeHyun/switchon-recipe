import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Maybe } from 'types/common';
import { UserSettingDB } from 'types/database';
import type { Json } from 'types/database.types';
import { captureError, sendError } from 'utils/sendError';
import {
  goalFromRow,
  type GoalHistoryItem,
  type WeightGoal,
  type WeightGoalState,
} from 'utils/weightGoal';

export type UserSettingPatch = Partial<
  Pick<UserSettingDB, 'weight_reminder' | 'weight_reminder_asked' | 'report_reminder'>
>;

// 내 설정. 행이 없으면 null(=기본값). 실패 시 throw
const get = async (): Promise<UserSettingDB | null> => {
  const uid = useUserStore.getState().id;
  const { data, error } = await supabase
    .from('user_setting')
    .select('*')
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    captureError({ error, prefix: '[UserSettingAPI.get]: ' });
    throw error;
  }
  return data;
};

// 설정 일부 저장 (행이 없으면 만든다). 실패하면 토스트 후 undefined
const upsert = async (patch: UserSettingPatch) =>
  sendError<Maybe<UserSettingDB>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('user_setting')
      .upsert({ uid, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'uid' })
      .select()
      .single();

    if (error) throw error;
    return data;
  });

const GOAL_SAVE_ERROR = {
  textType: 'CUSTOM' as const,
  title: '목표를 저장하지 못했어요',
  subtitle: '잠시 뒤 다시 시도해 주세요',
  prefix: '[UserSettingAPI.upsertGoal]: ',
};
const UNDEFINED_COLUMN = '42703';
const GOAL_COLUMNS = 'weight_goal_kg, muscle_goal_kg, fat_goal_kg, weight_goal_history';

// 체중 목표. 행이 없으면 목표 없음. 열이 아직 없거나(마이그레이션 전) 실패하면 throw (화면은 목표 칸을 숨긴다)
const getGoal = async (): Promise<WeightGoalState> => {
  const uid = useUserStore.getState().id;
  const { data, error } = await supabase
    .from('user_setting')
    .select(GOAL_COLUMNS)
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    // 열이 아직 없으면(42703, 마이그레이션 전) 예상된 실패라 보내지 않는다
    if (error.code !== UNDEFINED_COLUMN)
      captureError({ error, prefix: '[UserSettingAPI.getGoal]: ' });
    throw error;
  }
  return goalFromRow(data);
};

// 목표 저장·달성 기록 저장 (행이 없으면 만든다). 실패하면 토스트 후 undefined
const upsertGoal = async (
  patch: Partial<WeightGoal> & { weight_goal_history?: GoalHistoryItem[] }
) =>
  sendError<Maybe<WeightGoalState>>(async () => {
    const uid = useUserStore.getState().id;
    if (!uid) return;
    const { weight_goal_history, ...goal } = patch;

    const { data, error } = await supabase
      .from('user_setting')
      .upsert(
        {
          uid,
          ...goal,
          ...(weight_goal_history && {
            weight_goal_history: weight_goal_history as unknown as Json,
          }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'uid' }
      )
      .select(GOAL_COLUMNS)
      .single();

    if (error) throw error;
    return goalFromRow(data);
  }, GOAL_SAVE_ERROR);

export const UserSettingAPI = { get, upsert, getGoal, upsertGoal };
