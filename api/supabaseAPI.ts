import { decode } from 'base64-arraybuffer';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { Recipe } from 'types/recipe';
import { sendDBError } from 'utils/sendError';
import { supabase } from '../lib/supabase';

// RECIPE
const selectRecentRecipeFromDB = async (): Promise<RecipeDB[]> =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('uid', userId)
      .order('created_at', { ascending: false })
      .range(0, 9);

    if (error) throw error;

    return data;
  });

const insertRecipeToDB = async (recipe: Recipe, week: number): Promise<RecipeDB> =>
  sendDBError(async () => {
    const { data, error } = await supabase
      .from('recipe')
      .insert<Partial<RecipeDB>>({
        cooking_steps: JSON.stringify(recipe.cookingSteps),
        ingredients: JSON.stringify(recipe.ingredients),
        nutrition: JSON.stringify(recipe.nutrition),
        cooking_time: recipe.cookingTime,
        recipe_name: recipe.recipeName,
        image_uri: recipe.imageUri,
        week,
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  });

// SAVED_RECIPE
const checkIsSavedRecipe = async (recipeId: number): Promise<boolean> =>
  sendDBError(
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

const selectSavedRecipeByWeekFromDB = async (week: number): Promise<RecipeDB[]> =>
  sendDBError(async () => {
    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('week', week)
      .eq('is_saved', true)
      .order('saved_at', { ascending: false });

    if (error) throw error;

    return data;
  });

const selectSavedRecipeFromDB = async (): Promise<RecipeDB[]> =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('recipe_with_is_saved')
      .select('*')
      .eq('is_saved', true)
      .order('saved_at', { ascending: false })
      .range(0, 9);

    if (error) throw error;

    return data;
  });

const insertSavedRecipeToDB = async (recipeId: number) =>
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

      const savedRecipes = await selectSavedRecipeFromDB();
      setSavedRecipes(savedRecipes);
    }
  });

const deleteSavedRecipeFromDB = async (recipeId: number) =>
  sendDBError(async () => {
    const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
    const setRecentRecipes = useRecipeStore.getState().setRecentRecipes;
    const isSavedRecipe = await checkIsSavedRecipe(recipeId);

    if (isSavedRecipe) {
      const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);

      if (error) throw error;

      const [savedRecipes, recentRecipes] = await Promise.all([
        selectSavedRecipeFromDB(),
        selectRecentRecipeFromDB(),
      ]);

      setSavedRecipes(savedRecipes);
      setRecentRecipes(recentRecipes);
    }
  });

// STORAGE
const uploadImageToDB = async (mime, base64Image) =>
  sendDBError(async () => {
    const ext = mime.split('/')[1];
    const fileName = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('recipe-images')
      .upload(fileName, decode(base64Image), { contentType: mime, upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from('recipe-images').getPublicUrl(fileName);
    return data.publicUrl;
  });

export {
  checkIsSavedRecipe,
  deleteSavedRecipeFromDB,
  insertRecipeToDB,
  insertSavedRecipeToDB,
  selectRecentRecipeFromDB,
  selectSavedRecipeByWeekFromDB,
  selectSavedRecipeFromDB,
  uploadImageToDB,
};
