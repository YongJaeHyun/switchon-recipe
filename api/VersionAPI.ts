import { supabase } from 'lib/supabase';
import { VersionDB } from 'types/database';
import { sendError } from 'utils/sendError';
import { parseStoreUpdateMode, type StoreUpdateMode } from 'utils/storeUpdate';

const selectLatestVersion = async () =>
  sendError(async () => {
    const { data, error } = await supabase.from('version').select('*').single<VersionDB>();

    if (error) throw new Error(`[Supabase] ${error.message}`);

    return data.latest_version;
  });

// 스토어 업데이트 안내 스위치. 표시용이라 실패(열 반영 전 포함)하면 off로 보고 오류를 보내지 않는다
const selectStoreUpdateMode = async (): Promise<StoreUpdateMode> => {
  const { data, error } = await supabase.from('version').select('*').eq('id', 1).maybeSingle();
  if (error || !data) return 'off';
  return parseStoreUpdateMode((data as { store_update_mode?: unknown }).store_update_mode);
};

export const VersionAPI = {
  selectLatestVersion,
  selectStoreUpdateMode,
};
