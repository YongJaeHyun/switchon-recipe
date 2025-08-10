import { supabase } from 'lib/supabase';
import { VersionDB } from 'types/database';
import { sendDBError } from 'utils/sendError';

const selectLatestVersion = async () =>
  sendDBError(
    async () => {
      const { data, error } = await supabase.from('version').select('*').single<VersionDB>();

      if (error) throw new Error(`[Supabase] ${error.message}`);

      return data.latest_version;
    },
    {
      errorReturnValue: '1.0.0',
    }
  );

export const VersionAPI = {
  selectLatestVersion,
};
