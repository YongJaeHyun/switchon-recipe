import { RecipeFilterType } from 'const/filter';
import { QueryKey } from 'const/queryKey';
import { RecipeSortType } from 'const/sort';
import { queryClient } from 'lib/queryClient';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import {
  RecipeWithIsSavedDB,
  SavedRecipeDB,
  SearchRecipesReturn,
  SearchSavedRecipesReturn,
} from 'types/database';
import { sendError } from 'utils/sendError';
import { useSavedRecipeStore } from '../stores/savedRecipeStore';

// RECENT_RECIPE
const selectAllRecent = async () =>
  sendError<RecipeWithIsSavedDB[]>(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) throw new Error('userId가 존재하지 않습니다.');

    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false })
      .range(0, 9);

    if (error) throw error;

    return data;
  });

// SAVED_RECIPE
const checkIsSavedRecipe = async (recipeId: number) =>
  sendError<boolean>(async () => {
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('saved_recipe')
      .select('id')
      .eq('recipe_id', recipeId)
      .eq('uid', userId)
      .limit(1);

    if (error) throw error;

    return !!data?.length;
  });

const selectAllSavedByWeek = async (week: number) =>
  sendError<SearchSavedRecipesReturn>(async () => {
    const { sort, filter } = useSavedRecipeStore.getState();

    const { data, error } = await supabase.rpc('search_saved_recipes', {
      filter_type: filter,
      sort_type: sort,
      week_input: week,
    });

    if (error) throw error;

    return data;
  });

const selectAllSaved = async () =>
  sendError<RecipeWithIsSavedDB[]>(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) throw new Error('userId가 존재하지 않습니다.');

    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('is_saved', true)
      .order('saved_at', { ascending: false })
      .range(0, 9);

    if (error) throw error;

    return data;
  });

interface selectAllByWeekWithPaginationProps {
  week: number;
  currentPage: number;
  keyword?: string;
  sortType?: RecipeSortType;
  filterType?: RecipeFilterType;
  pageSize?: number;
}
const selectAllByWeekWithPagination = async ({
  week,
  keyword,
  currentPage,
  sortType = '최신순',
  filterType = '전체',
  pageSize = 10,
}: selectAllByWeekWithPaginationProps) =>
  sendError<SearchRecipesReturn>(async () => {
    const { data, error } = await supabase
      .rpc('search_recipes', {
        filter_type: filterType,
        sort_type: sortType,
        week_input: week,
        keyword_input: keyword,
      })
      .range(currentPage, currentPage + pageSize - 1);

    if (error) throw error;

    return data;
  });

const insertSaved = async (recipeId: number) =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    const isSavedRecipe = await checkIsSavedRecipe(recipeId);

    if (!isSavedRecipe) {
      const { error } = await supabase.from('saved_recipe').insert<Partial<SavedRecipeDB>>({
        recipe_id: recipeId,
        uid: userId,
      });

      if (error) throw error;

      queryClient.removeQueries({ queryKey: [QueryKey.savedRecipes, QueryKey.recipeCards] });
    }
  });

const deleteSaved = async (recipeId: number) =>
  sendError(async () => {
    const isSavedRecipe = await checkIsSavedRecipe(recipeId);

    if (isSavedRecipe) {
      const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);

      if (error) throw error;

      queryClient.removeQueries({ queryKey: [QueryKey.savedRecipes, QueryKey.recipeCards] });
    }
  });

export const RecipeAPI = {
  selectAllRecent,
  selectAllSavedByWeek,
  insertSaved,
  deleteSaved,
  selectAllSaved,
  checkIsSavedRecipe,
  selectAllByWeekWithPagination,
};
