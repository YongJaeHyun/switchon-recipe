import { decode } from 'base64-arraybuffer';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { Recipe } from 'types/gemini';
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
const insertSavedRecipeToDB = async (recipeId: number, recipeUid: string) => {
  const { error } = await supabase.from('saved-recipe').insert<Partial<SavedRecipeDB>>({
    recipe_id: recipeId,
    uid: recipeUid,
  });
  if (error) console.error('레시피 저장 실패', error);
};

const deleteSavedRecipeFromDB = async (recipeId: number) => {
  const { data } = await supabase
    .from('saved-recipe')
    .select('id')
    .eq('recipe_id', recipeId)
    .maybeSingle();

  if (data?.id) {
    const { error } = await supabase.from('saved-recipe').delete().eq('recipe_id', recipeId);
    if (error) console.error('저장된 레시피 삭제 실패', error);
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
  uploadImageToDB,
};
