import axios, { isAxiosError, isCancel } from 'axios';
import { RecipeDB } from 'types/database';
import type { QuotaExceeded } from 'types/recipeQuota';
import { quotaExceededFromBody } from 'utils/recipeQuota';
import { isNetworkError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { Maybe } from '../types/common';
import { UserAPI } from './UserAPI';

// 레시피·이미지 생성까지 기다린다 (멈춘 요청이 만들기를 막지 않게)
const REQUEST_TIMEOUT_MS = 120 * 1000;

interface CreateRecipeProps {
  command: string;
  week: number;
  isZeroCarb: boolean;
  signal?: AbortSignal;
  // 뒤에서 만들 때: 실패 토스트 없이 결과만 돌려준다 (하단 띠가 알린다)
  quiet?: boolean;
}

export const createRecipe = async ({
  command,
  week,
  isZeroCarb: is_zero_carb,
  signal,
  quiet = false,
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
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    return response.data;
  } catch (error) {
    // 하루 한도 초과(429)는 토스트 없이 호출부가 모달로 안내하도록 돌려준다
    if (isAxiosError(error) && error.response?.status === 429) {
      const body = error.response.data;
      if (body?.code === 'QUOTA_EXCEEDED') return quotaExceededFromBody(body);
    }

    if (quiet) return;
    if (isNetworkError(error)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
    } else if (isCancel(error)) {
      showErrorToast({ textType: 'RECIPE_CREATION_CANCELED' });
    } else {
      showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    }
  }
};
