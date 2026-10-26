import axios from 'axios';
import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import type { RecommendOutcome, RecommendRequest } from 'types/recommend';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { showNetworkErrorToast } from 'utils/network';
import { interpretRecommendResponse, RECOMMEND_ERROR_MESSAGE } from 'utils/recommendResponse';
import { captureError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from './UserAPI';

// 필터·섞기만 하는 조회라 오래 걸리지 않는다
const REQUEST_TIMEOUT_MS = 20 * 1000;

// 추천 요청. 서버가 정한 결과(성공/쉐이크/402/400/500)는 RecommendOutcome으로 돌려주고 화면이 안내한다.
// 네트워크 오류·시간 초과는 여기서 토스트로 안내(취소는 조용히)하고 undefined를 돌려준다
const recommend = async (
  conditions: RecommendRequest,
  signal?: AbortSignal
): Promise<RecommendOutcome | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/recommend-recipes`,
      conditions,
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
    const outcome = interpretRecommendResponse(response.status, response.data);
    if (outcome.status === 'error' || outcome.status === 'invalid') {
      captureError({
        error: new Error(`recommend-recipes ${response.status}: ${JSON.stringify(response.data)}`),
        prefix: '[RecommendAPI.recommend]: ',
      });
    }
    return outcome;
  } catch (error) {
    const kind = classifyFoodCheckRequestError(error);
    if (kind === 'canceled') return undefined;
    if (kind === 'network') {
      showNetworkErrorToast();
      return undefined;
    }
    if (kind !== 'timeout') captureError({ error, prefix: '[RecommendAPI.recommend]: ' });
    showErrorToast({ textType: 'CUSTOM', title: '추천 실패', subtitle: RECOMMEND_ERROR_MESSAGE });
    return undefined;
  }
};

// 저장된 빼고 싶은 재료 (본인 행만 RLS로 조회). 행이 없으면 []. 실패 시 throw (React Query가 처리)
const getExcludedIngredients = async (): Promise<string[]> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('user_recipe_preference')
    .select('excluded_ingredients')
    .eq('uid', uid)
    .maybeSingle();

  if (error) {
    captureError({ error, prefix: '[RecommendAPI.getExcludedIngredients]: ' });
    throw error;
  }
  return data?.excluded_ingredients ?? [];
};

// 빼고 싶은 재료 저장. updated_at은 트리거가 없으므로 직접 넣는다. 실패 시 throw
const saveExcludedIngredients = async (ingredients: string[]): Promise<string[]> => {
  const uid = useUserStore.getState().id;
  if (!uid) throw new Error('로그인이 필요합니다');

  const { error } = await supabase
    .from('user_recipe_preference')
    .upsert(
      { uid, excluded_ingredients: ingredients, updated_at: new Date().toISOString() },
      { onConflict: 'uid' }
    );

  if (error) {
    captureError({ error, prefix: '[RecommendAPI.saveExcludedIngredients]: ' });
    throw error;
  }
  return ingredients;
};

export const RecommendAPI = { recommend, getExcludedIngredients, saveExcludedIngredients };
