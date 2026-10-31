import axios from 'axios';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { showNetworkErrorToast } from 'utils/network';
import { type RecipeByNameOutcome, interpretRecipeByNameResponse } from 'utils/recipeByName';
import { captureError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from './UserAPI';

// 이름 판정 + 레시피·이미지 생성까지 기다린다
const REQUEST_TIMEOUT_MS = 120 * 1000;

// 먹고 싶은 음식 이름으로 레시피 만들기. 서버가 정한 결과(성공/거절/한도/402/400/500)는 RecipeByNameOutcome으로
// 돌려주고 화면이 안내한다. 네트워크 오류·시간 초과·취소는 여기서 안내(취소는 조용히)하고 undefined를 돌려준다
const create = async (
  // week: 고른 주차 (1~4, 5 = 유지기)
  input: { name: string; isZeroCarb: boolean; week: number },
  signal?: AbortSignal,
  // 뒤에서 만들 때: 네트워크·시간 초과 토스트 없이 undefined만 (하단 띠가 알린다)
  quiet = false
): Promise<RecipeByNameOutcome | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-recipe-by-name`,
      input,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
    const outcome = interpretRecipeByNameResponse(response.status, response.data);
    if (outcome.status === 'error') {
      captureError({
        error: new Error(
          `create-recipe-by-name ${response.status}: ${JSON.stringify(response.data)}`
        ),
        prefix: '[RecipeByNameAPI.create]: ',
      });
    }
    return outcome;
  } catch (error) {
    const kind = classifyFoodCheckRequestError(error);
    if (kind === 'canceled') return undefined;
    if (kind === 'network') {
      if (!quiet) showNetworkErrorToast();
      return undefined;
    }
    if (kind !== 'timeout') captureError({ error, prefix: '[RecipeByNameAPI.create]: ' });
    if (quiet) return undefined;
    showErrorToast({ textType: 'RECIPE_CREATION_TEMPORARY_ERROR' });
    return undefined;
  }
};

export const RecipeByNameAPI = { create };
