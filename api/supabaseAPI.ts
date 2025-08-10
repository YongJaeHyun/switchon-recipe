import { decode } from 'base64-arraybuffer';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB, UserDB } from 'types/database';
import { Recipe } from 'types/recipe';
import sendDBError from 'utils/sendError';
import { showSuccessToast } from 'utils/showToast';
import { supabase } from '../lib/supabase';

// AUTH
const getSession = async () =>
  sendDBError(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return data.session;
  });

const checkIsLoggedIn = async () =>
  sendDBError(
    async () => {
      const session = await getSession();

      if (session?.access_token) {
        const setUser = useUserStore.getState().setUser;
        const user = await selectUserFromDB(session.user.id);
        await setUser(user);
      }

      return session?.access_token ? true : false;
    },
    {
      errorReturnValue: false,
    }
  );

const logout = async () =>
  sendDBError(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;
  });

// USER
const selectUserFromDB = async (userId: string) =>
  sendDBError(async () => {
    const { data, error } = await supabase.from('user').select().eq('id', userId).single<UserDB>();

    if (error) throw error;

    return data;
  });

const updateOnboardingToDB = async (start_date: string) =>
  sendDBError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;

    const { data, error } = await supabase
      .from('user')
      .update({ start_date, is_onboarded: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
  });

const updateStartDateToDB = async (start_date: string) =>
  sendDBError(async () => {
    const setUser = useUserStore.getState().setUser;
    const userId = useUserStore.getState().id;
    const { data, error } = await supabase
      .from('user')
      .update({ start_date })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    setUser(data);
    showSuccessToast({
      text1: '시작날짜 재설정 성공',
      text2: `${start_date}일로 정상적으로 변경되었습니다`,
    });
  });

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
  checkIsLoggedIn,
  checkIsSavedRecipe,
  deleteSavedRecipeFromDB,
  getSession,
  insertRecipeToDB,
  insertSavedRecipeToDB,
  logout,
  selectRecentRecipeFromDB,
  selectSavedRecipeByWeekFromDB,
  selectSavedRecipeFromDB,
  selectUserFromDB,
  updateOnboardingToDB,
  updateStartDateToDB,
  uploadImageToDB,
};
