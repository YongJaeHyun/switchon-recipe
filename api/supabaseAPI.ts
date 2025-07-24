import { decode } from 'base64-arraybuffer';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { Recipe } from 'types/recipe';
import { supabase } from '../lib/supabase';

// AUTH
const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('세션 가져오기 오류:', error.message);
    return null;
  }
  return data.session;
};

const checkIsLoggedIn = async () => {
  const session = await getSession();
  return session?.access_token ? true : false;
};

const logout = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('로그아웃 실패:', error.message);
  } else {
    useUserStore.getState().setUser(null);
  }
};

// RECIPE
const selectRecentRecipeFromDB = async (): Promise<RecipeDB[]> => {
  const userId = useUserStore.getState().user.id;
  const { data, error } = await supabase
    .from('recipe_with_is_saved')
    .select('*')
    .eq('uid', userId)
    .order('created_at', { ascending: false })
    .range(0, 9);

  if (error) console.error('최근 레시피 조회 실패', error);
  return data;
};

const insertRecipeToDB = async (recipe: Recipe): Promise<RecipeDB> => {
  const { data, error } = await supabase
    .from('recipe')
    .insert<Partial<RecipeDB>>({
      cooking_steps: JSON.stringify(recipe.cookingSteps),
      ingredients: JSON.stringify(recipe.ingredients),
      nutrition: JSON.stringify(recipe.nutrition),
      cooking_time: recipe.cookingTime,
      recipe_name: recipe.recipeName,
      image_uri: recipe.imageUri,
    })
    .select()
    .single();

  if (error) console.error('레시피 추가 실패', error);
  return data;
};

// SAVED_RECIPE
const checkIsSavedRecipe = async (recipeId: number): Promise<boolean> => {
  const { data, error } = await supabase
    .from('saved_recipe')
    .select('id')
    .eq('recipe_id', recipeId)
    .limit(1);

  if (error) {
    console.error('저장된 레시피 여부 조회 실패', error);
    return false;
  }

  return !!data?.length;
};

const selectSavedRecipeFromDB = async (): Promise<RecipeDB[]> => {
  const userId = useUserStore.getState().user.id;
  const { data, error } = await supabase
    .from('recipe_with_is_saved')
    .select('*')
    .eq('uid', userId)
    .eq('isSaved', true)
    .order('created_at', { ascending: false })
    .range(0, 9);

  if (error) console.error('저장된 레시피 조회 실패', error);
  return data;
};

const insertSavedRecipeToDB = async (recipeId: number, recipeUid: string) => {
  const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
  const isSavedRecipe = await checkIsSavedRecipe(recipeId);

  if (!isSavedRecipe) {
    const { error } = await supabase.from('saved_recipe').insert<Partial<SavedRecipeDB>>({
      recipe_id: recipeId,
      uid: recipeUid,
    });

    if (error) console.error('레시피 저장 실패', error);
    else {
      const savedRecipes = await selectSavedRecipeFromDB();
      setSavedRecipes(savedRecipes);
    }
  }
};

const deleteSavedRecipeFromDB = async (recipeId: number) => {
  const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
  const setRecentRecipes = useRecipeStore.getState().setRecentRecipes;
  const isSavedRecipe = await checkIsSavedRecipe(recipeId);

  if (isSavedRecipe) {
    const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);

    if (error) console.error('저장된 레시피 삭제 실패', error);
    else {
      const [savedRecipes, recentRecipes] = await Promise.all([
        selectSavedRecipeFromDB(),
        selectRecentRecipeFromDB(),
      ]);
      setSavedRecipes(savedRecipes);
      setRecentRecipes(recentRecipes);
    }
  }
};

// STORAGE
const uploadImageToDB = async (mime, base64Image) => {
  const ext = mime.split('/')[1];
  const fileName = `${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(fileName, decode(base64Image), { contentType: mime, upsert: false });

  if (error) {
    console.error('Error uploading image: ', error);
  }

  const { data } = supabase.storage.from('recipe-images').getPublicUrl(fileName);
  return data.publicUrl;
};

export {
  checkIsLoggedIn,
  deleteSavedRecipeFromDB,
  getSession,
  insertRecipeToDB,
  insertSavedRecipeToDB,
  logout,
  selectRecentRecipeFromDB,
  selectSavedRecipeFromDB,
  uploadImageToDB,
};
