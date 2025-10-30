import { supabase } from 'lib/supabase';
import { SearchCategoryHistoryDB } from 'types/database';
import { sendError } from 'utils/sendError';

const getPopularCategories = async () =>
  sendError<SearchCategoryHistoryDB[]>(async () => {
    const { data, error } = await supabase.from('popular_categories').select('*').limit(20);

    if (error) throw error;

    return data;
  });

const insert = async (category: string) =>
  sendError<SearchCategoryHistoryDB>(async () => {
    const { data, error } = await supabase
      .from('user_search_category_history')
      .insert({ value: category })
      .select()
      .single();

    if (error) throw error;

    return data;
  });

export const SearchCategoryHistoryAPI = {
  getPopularCategories,
  insert,
};
