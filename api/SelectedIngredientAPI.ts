import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { SelectedIngredientDB } from 'types/database';
import { IIngredient } from 'types/recipe';
import { sendDBError } from 'utils/sendError';

const selectAll = async (): Promise<IIngredient[]> =>
  sendDBError(
    async () => {
      const userId = useUserStore.getState().id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('selected_ingredient')
        .select('*')
        .eq('uid', userId)
        .maybeSingle<SelectedIngredientDB>();

      if (error) throw error;

      return data ? JSON.parse(data.ingredients) : [];
    },
    {
      errorReturnValue: [],
    }
  );

const upsert = async (ingredients: IIngredient[]) =>
  sendDBError(async () => {
    const userId = useUserStore.getState().id;

    const { error } = await supabase
      .from('selected_ingredient')
      .upsert({ ingredients: JSON.stringify(ingredients), uid: userId }, { onConflict: 'uid' });

    if (error) throw error;

    return ingredients;
  });

const reset = async () =>
  sendDBError(async () => {
    await upsert([]);
  });

export const SelectedIngredientAPI = {
  selectAll,
  upsert,
  reset,
};
