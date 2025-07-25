import { decode } from 'base64-arraybuffer';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import { RecipeDB, SavedRecipeDB } from 'types/database';
import { Recipe } from 'types/recipe';
import { showErrorToast, showSuccessToast } from 'utils/showToast';
import { supabase } from '../lib/supabase';

// AUTH
const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
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
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
  }

  useUserStore.getState().setUser(null);
};

// USER
const updateStartDateToDB = async (start_date: string) => {
  const user = useUserStore.getState().user;
  const { error } = await supabase.from('user').update({ start_date }).eq('id', user.id);

  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
  } else {
    showSuccessToast({
      text1: '시작날짜 재설정 성공',
      text2: `${start_date}일로 정상적으로 변경되었습니다`,
      error,
    });
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

  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
  }
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

  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
  }
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
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
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

  if (error) {
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
  }

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

    if (error) {
      showErrorToast({
        text1: 'DB 에러 발생',
        text2: '에러 발생이 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
        error,
      });
      return;
    }

    const savedRecipes = await selectSavedRecipeFromDB();
    setSavedRecipes(savedRecipes);
  }
};

const deleteSavedRecipeFromDB = async (recipeId: number) => {
  const setSavedRecipes = useRecipeStore.getState().setSavedRecipes;
  const setRecentRecipes = useRecipeStore.getState().setRecentRecipes;
  const isSavedRecipe = await checkIsSavedRecipe(recipeId);

  if (isSavedRecipe) {
    const { error } = await supabase.from('saved_recipe').delete().eq('recipe_id', recipeId);

    if (error) {
      showErrorToast({
        text1: 'DB 에러 발생',
        text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
        error,
      });
      return;
    }

    const [savedRecipes, recentRecipes] = await Promise.all([
      selectSavedRecipeFromDB(),
      selectRecentRecipeFromDB(),
    ]);
    setSavedRecipes(savedRecipes);
    setRecentRecipes(recentRecipes);
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
    showErrorToast({
      text1: 'DB 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
      error,
    });
    return;
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
  updateStartDateToDB,
  uploadImageToDB,
};
