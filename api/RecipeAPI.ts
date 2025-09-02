import { supabase } from 'lib/supabase';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { sendDBError } from 'utils/sendError';

const selectAllRecent = async () =>
  sendDBError<RecipeDB[]>(async () => {
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
  sendDBError<boolean>(
    async () => {
      const { data, error } = await supabase
        .from('saved_recipe')
        .select('id')
        .eq('recipe_id', recipeId)
        .limit(1);

      if (error) throw error;

      return !!data?.length;
    },
    { errorReturnValue: false }
  );

const selectAllSavedByWeek = async (week: number) =>
  sendDBError<RecipeDB[]>(async () => {
    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('week', week)
      .eq('is_saved', true)
      .order('saved_at', { ascending: false });

    if (error) throw error;

    return data;
  });

const selectAllSaved = async () =>
  sendDBError<RecipeDB[]>(async () => {
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
  sendDBError(async () => {
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
    }
  });

const deleteSaved = async (recipeId: number) =>
  sendDBError(async () => {
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
