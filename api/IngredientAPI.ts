import { supabase } from 'lib/supabase';
import { IngredientDB } from 'types/database';
import { IngredientRecord } from 'types/recipe';
import { captureError } from 'utils/sendError';

const toIngredientRecord = (row: IngredientDB): IngredientRecord => ({
  name: row.name,
  subKeywords: row.sub_keywords,
  week: row.week,
  image: row.image_url,
  isCarbohydrate: row.is_carbohydrate,
  source: row.source as IngredientRecord['source'],
  createdAt: row.created_at,
  sortOrder: row.sort_order,
});

// 실패 시 throw: 호출부(loadIngredientsWithCache)에서 캐시로 대체
const selectAll = async (): Promise<IngredientRecord[]> => {
  const { data, error } = await supabase
    .from('ingredient')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    captureError({ error, prefix: '[IngredientAPI.selectAll]: ' });
    throw error;
  }

  return data.map(toIngredientRecord);
};

export const IngredientAPI = {
  selectAll,
};
