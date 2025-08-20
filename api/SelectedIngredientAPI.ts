import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { RecipeType, SelectedIngredientDB } from 'types/database';
import { IIngredient } from 'types/recipe';
import { sendDBError } from 'utils/sendError';

const selectAll = async (type: RecipeType): Promise<IIngredient[]> =>
  sendDBError(
    async () => {
      const userId = useUserStore.getState().id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from('selected_ingredient')
        .select('*')
        .eq('uid', userId)
        .maybeSingle<SelectedIngredientDB>();

      if (error) throw error;
      if (!data) return [];

      const ingredients = type === 'zero' ? data.zero_ingredients : data.ingredients;
      return JSON.parse(ingredients);
    },
    {
      errorReturnValue: [],
    }
  );

const upsert = async (type: RecipeType, ingredients: IIngredient[]) => {
  if (type === 'zero') return await upsertZeroIngredients(ingredients);
  else if (type === 'low') return await upsertLowIngredients(ingredients);
  else return [];
};

const upsertZeroIngredients = async (ingredients: IIngredient[]) =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;

    const { error } = await supabase
      .from('selected_ingredient')
      .upsert(
        { zero_ingredients: JSON.stringify(ingredients), uid: userId },
        { onConflict: 'uid' }
      );

    if (error) throw error;

    return ingredients;
  });

const upsertLowIngredients = async (ingredients: IIngredient[]) =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;

    const { error } = await supabase
      .from('selected_ingredient')
      .upsert({ ingredients: JSON.stringify(ingredients), uid: userId }, { onConflict: 'uid' });

    if (error) throw error;

    return ingredients;
  });

const reset = async (type: RecipeType) =>
  sendDBError(async () => {
    await upsert(type, []);
  });

export const SelectedIngredientAPI = {
  selectAll,
  upsert,
  reset,
};
