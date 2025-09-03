import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { supabase } from 'lib/supabase';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { sendError } from 'utils/sendError';
import { useSavedRecipeStore } from '../stores/savedRecipeStore';

const selectAllRecent = async () =>
  sendError<RecipeDB[]>(async () => {
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
    const { data, error } = await supabase
      .from('saved_recipe')
      .select('id')
      .eq('recipe_id', recipeId)
      .limit(1);

    if (error) throw error;

    return !!data?.length;
  });

const selectAllSavedByWeek = async (week: number) =>
  sendError<RecipeDB[]>(async () => {
    const { sort, filter } = useSavedRecipeStore.getState();

    let query = supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('week', week)
      .eq('is_saved', true);

    switch (filter) {
      case '무탄수':
        query = query.eq('is_zero_carb', true);
        break;
      case '저탄수':
        query = query.eq('is_zero_carb', false);
        break;
    }

    switch (sort) {
      case '조리시간순':
        query = query.order('cooking_time', { ascending: true });
      case '최신순':
      default:
        query = query.order('saved_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  });

const selectAllSaved = async () =>
  sendError<RecipeDB[]>(async () => {
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

const insertSaved = async (recipeId: number) =>
  sendError(async () => {
    const userId = useUserStore.getState().id;
    const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
    const isSavedRecipe = await checkIsSavedRecipe(recipeId);

    if (!isSavedRecipe) {
      const { error } = await supabase.from('saved_recipe').insert<Partial<SavedRecipeDB>>({
        recipe_id: recipeId,
        uid: userId,
      });

      if (error) throw error;

      const savedRecipes = await selectAllSaved();
      setSavedRecipes(savedRecipes ?? []);

      queryClient.invalidateQueries({ queryKey: [QueryKey.savedRecipes] });
    }
  });

const deleteSaved = async (recipeId: number) =>
  sendError(async () => {
    const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
    const setRecentRecipes = useRecipeStore.getState().setRecentRecipes;
    const isSavedRecipe = await checkIsSavedRecipe(recipeId);

    if (isSavedRecipe) {
      const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);

      if (error) throw error;

      const [savedRecipes, recentRecipes] = await Promise.all([
        selectAllSaved(),
        selectAllRecent(),
      ]);

      setSavedRecipes(savedRecipes ?? []);
      setRecentRecipes(recentRecipes ?? []);

      queryClient.removeQueries({ queryKey: [QueryKey.savedRecipes] });
    }
  });

export const RecipeAPI = {
  selectAllRecent,
  selectAllSavedByWeek,
  insertSaved,
  deleteSaved,
  selectAllSaved,
  checkIsSavedRecipe,
};
