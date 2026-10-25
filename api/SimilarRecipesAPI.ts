import axios from 'axios';
import type { RecipeWithIsSavedDB } from 'types/database';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { captureError } from 'utils/sendError';
import { parseSimilarResponse } from 'utils/similarResponse';
import { UserAPI } from './UserAPI';

const REQUEST_TIMEOUT_MS = 15 * 1000;

// 레시피 상세의 비슷한 레시피 (무료). 실패하면 throw하고 화면은 섹션을 숨긴다 (토스트 없음).
// 예상하지 못한 응답만 Sentry로 보낸다 (네트워크·시간 초과·취소, 지워진 레시피의 404는 조용히)
const getSimilar = async (recipeId: number): Promise<RecipeWithIsSavedDB[]> => {
  const session = await UserAPI.getSession();
  let response;
  try {
    response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/similar-recipes`,
      { recipeId },
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch (error) {
    if (classifyFoodCheckRequestError(error) === 'unknown') {
      captureError({ error, prefix: '[SimilarRecipesAPI.getSimilar]: ' });
    }
    throw error;
  }

  const recipes = response.status === 200 ? parseSimilarResponse(response.data) : null;
  if (!recipes) {
    const error = new Error(`similar-recipes ${response.status}: ${JSON.stringify(response.data)}`);
    if (response.status !== 404) {
      captureError({ error, prefix: '[SimilarRecipesAPI.getSimilar]: ' });
    }
    throw error;
  }
  return recipes;
};

export const SimilarRecipesAPI = { getSimilar };
