import axios, { isAxiosError, isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import type { QuotaExceeded } from 'types/recipeQuota';
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
}: CreateRecipeProps): Promise<Maybe<RecipeDB> | QuotaExceeded> => {
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
    // 하루 한도 초과(429)는 토스트 없이 호출부가 모달로 안내하도록 돌려준다
    if (isAxiosError(error) && error.response?.status === 429) {
      const body = error.response.data;
      if (body?.code === 'QUOTA_EXCEEDED') {
        return {
          quotaExceeded: true,
          canWatchAd: body.canWatchAd === true,
          isPass: body.isPass === true,
        };
      }
    }

    if (isNetworkError(error)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
    } else if (isCancel(error)) {
      showErrorToast({ textType: 'RECIPE_CREATION_CANCELED' });
    } else {
      showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    }
  }
};
