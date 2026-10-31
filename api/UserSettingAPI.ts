import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { Maybe } from 'types/common';
import { UserSettingDB } from 'types/database';
import { captureError, sendError } from 'utils/sendError';

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

export const UserSettingAPI = { get, upsert };
