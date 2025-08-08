import * as Sentry from '@sentry/react-native';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { SelectedIngredientDB } from 'types/database';
import { IIngredient } from 'types/recipe';
import { showErrorToast } from 'utils/showToast';

const selectAll = async (): Promise<IIngredient[]> => {
  const userId = useUserStore.getState().id;

  try {
    const { data, error } = await supabase
      .from('selected_ingredient')
      .select('*')
      .eq('uid', userId)
      .maybeSingle<SelectedIngredientDB>();

    if (error) {
      showErrorToast({
        text1: 'DB 에러 발생',
        text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
        error,
      });
      throw new Error(`[Supabase] ${error.message}`);
    }

    return JSON.parse(data.ingredients);
  } catch (error) {
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureException(new Error(JSON.stringify(error)));
    }
    return [];
  }
};

const upsert = async (ingredients: IIngredient[]) => {
  const userId = useUserStore.getState().id;

  try {
    const { error } = await supabase
      .from('selected_ingredient')
      .upsert({ ingredients: JSON.stringify(ingredients), uid: userId }, { onConflict: 'uid' });

    if (error) {
      showErrorToast({
        text1: 'DB 에러 발생',
        text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다.',
        error,
      });
      throw new Error(error.message);
    }
    return ingredients;
  } catch (error) {
    Sentry.captureException(error);
  }
};

const reset = async () => {
  await upsert([]);
};

export const SelectedIngredientAPI = {
  selectAll,
  upsert,
  reset,
};
