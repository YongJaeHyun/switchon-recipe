import { supabase } from 'lib/supabase';
import { VersionDB } from 'types/database';
import { sendError } from 'utils/sendError';

const selectLatestVersion = async () =>
  sendError(async () => {
    const { data, error } = await supabase.from('version').select('*').single<VersionDB>();

    if (error) throw new Error(`[Supabase] ${error.message}`);

    return data.latest_version;
  });

export const VersionAPI = {
  selectLatestVersion,
};
