import axios, { isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import { isNetworkError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { Maybe } from '../types/common';
import { UserAPI } from './UserAPI';

interface CreateRecipeProps {
  command: string;
  week: number;
  isZeroCarb: boolean;
  signal?: AbortSignal;
}

export const createRecipe = async ({
  command,
  week,
  isZeroCarb: is_zero_carb,
  signal,
}: CreateRecipeProps): Promise<Maybe<RecipeDB>> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post<RecipeDB>(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-recipe-by-gemini`,
      { command, week, is_zero_carb },
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    return response.data;
  } catch (error) {
    if (isNetworkError(error)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
    } else if (isCancel(error)) {
      showErrorToast({ textType: 'RECIPE_CREATION_CANCELED' });
    } else {
      showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    }
  }
};
