import * as Sentry from '@sentry/react-native';
import axios, { isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import { showErrorToast } from 'utils/showToast';
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
}: CreateRecipeProps): Promise<RecipeDB | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post<RecipeDB>(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-recipe-by-gemini`,
      { command, week, is_zero_carb },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    return response.data;
  } catch (error: unknown) {
    if (isCancel(error)) {
      showErrorToast({ textType: 'RECIPE_CREATION_CANCELED' });
    } else {
      Sentry.captureException(error, { level: 'warning' });
      showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    }
  }
};
