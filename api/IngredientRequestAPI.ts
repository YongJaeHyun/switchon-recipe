import { supabase } from 'lib/supabase';
import { captureError } from 'utils/sendError';

const RLS_VIOLATION = '42501';

type CreateResult = 'ok' | 'limit' | 'error';

// RLS가 하루 5건 제한을 강제하므로, RLS 위반은 한도 초과로 처리
const create = async (name: string): Promise<CreateResult> => {
  try {
    const { error } = await supabase.from('ingredient_request').insert({ name: name.trim() });
    if (!error) return 'ok';
    if (error.code === RLS_VIOLATION) return 'limit';

    captureError({ error, prefix: '[IngredientRequestAPI.create]: ' });
    return 'error';
  } catch (error) {
    captureError({ error, prefix: '[IngredientRequestAPI.create]: ' });
    return 'error';
  }
};

export const IngredientRequestAPI = {
  create,
};
