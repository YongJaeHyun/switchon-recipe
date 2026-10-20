import axios, { isAxiosError, isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import { isNetworkError } from 'utils/sendError';
import { showErrorToast, showInfoToast } from 'utils/showToast';
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
    const edgeFunctionName = __DEV__ ? 'create-recipe-by-gemini-test' : 'create-recipe-by-gemini';
    const session = await UserAPI.getSession();

    const response = await axios.post<RecipeDB>(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${edgeFunctionName}`,
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
    // 서버의 하루 생성 한도 초과(429): 다시 시도해도 안 되므로 서버 안내 문구를 그대로 보여준다
    if (isAxiosError(error) && error.response?.status === 429) {
      const message = (error.response.data as { error?: string } | undefined)?.error;
      showInfoToast({
        textType: 'CUSTOM',
        title: message ?? '오늘 레시피를 모두 만들었어요.',
        subtitle: '내일 다시 만들 수 있어요.',
      });
    } else if (isNetworkError(error)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
    } else if (isCancel(error)) {
      showErrorToast({ textType: 'RECIPE_CREATION_CANCELED' });
    } else {
      showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    }
  }
};
