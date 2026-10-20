import axios, { isAxiosError, isCancel } from 'axios';
import { supabase } from 'lib/supabase';
import {
  FOOD_CHECK_FEATURE,
  type FoodCheckInput,
  type FoodCheckOutcome,
  type FoodCheckRecord,
  type PremiumQuotaStatus,
} from 'types/foodCheck';
import {
  interpretFoodCheckResponse,
  parsePremiumQuotaStatus,
  toFoodCheckRecord,
} from 'utils/foodCheckResponse';
import { captureError, isNetworkError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from './UserAPI';

const BUCKET = 'food-check';
const SIGNED_URL_EXPIRES_IN = 60 * 60;
// Gemini 판정 + 사진 업로드까지 기다린다
const REQUEST_TIMEOUT_MS = 60 * 1000;

// 판정 요청. 서버가 정한 결과(성공/인식 실패/402/429/413/400/500)는 FoodCheckOutcome으로 돌려주고
// 화면이 안내한다. 네트워크 오류·취소는 여기서 토스트를 띄우고 undefined를 돌려준다
const check = async (
  input: FoodCheckInput,
  signal?: AbortSignal
): Promise<FoodCheckOutcome | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/food-check`,
      input,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
        timeout: REQUEST_TIMEOUT_MS,
        // 상태 코드별 해석은 interpretFoodCheckResponse가 한다
        validateStatus: () => true,
      }
    );
    const outcome = interpretFoodCheckResponse(response.status, response.data);
    if (outcome.status === 'error') {
      captureError({
        error: new Error(`food-check ${response.status}: ${JSON.stringify(response.data)}`),
        prefix: '[FoodCheckAPI.check]: ',
      });
    }
    return outcome;
  } catch (error) {
    if (isCancel(error)) return undefined;
    if (isNetworkError(error) || (isAxiosError(error) && !error.response)) {
      showErrorToast({ textType: 'NETWORK_ERROR' });
      return undefined;
    }
    captureError({ error, prefix: '[FoodCheckAPI.check]: ' });
    showErrorToast({
      textType: 'CUSTOM',
      title: '판정 실패',
      subtitle: '판정에 실패했어요. 잠시 후 다시 시도해 주세요',
    });
    return undefined;
  }
};

// 썸네일 경로 -> signed URL. 실패한 것은 null (아이콘으로 대신 보여준다)
const signThumbs = async (paths: string[]): Promise<Map<string, string>> => {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);
  if (error || !data) {
    console.error('[FoodCheckAPI.signThumbs]', error);
    return urls;
  }
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
};

// 최근 판정 기록 (본인 행만 RLS로 조회). 실패 시 throw: 호출부(React Query)가 재시도/표시를 정한다
const list = async ({ limit }: { limit: number }): Promise<FoodCheckRecord[]> => {
  const { data, error } = await supabase
    .from('food_check')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    captureError({ error: error ?? new Error('empty response'), prefix: '[FoodCheckAPI.list]: ' });
    throw error ?? new Error('food_check: empty response');
  }

  const thumbs = await signThumbs(
    data.map((row) => row.thumb_path).filter((path): path is string => !!path)
  );
  return data.map((row) =>
    toFoodCheckRecord(row, row.thumb_path ? (thumbs.get(row.thumb_path) ?? null) : null)
  );
};

// 기록 하나. 없으면 null, 실패 시 throw
const get = async (id: number): Promise<FoodCheckRecord | null> => {
  const { data, error } = await supabase.from('food_check').select('*').eq('id', id).maybeSingle();

  if (error) {
    captureError({ error, prefix: '[FoodCheckAPI.get]: ' });
    throw error;
  }
  if (!data) return null;

  const thumbs = await signThumbs(data.thumb_path ? [data.thumb_path] : []);
  return toFoodCheckRecord(data, data.thumb_path ? (thumbs.get(data.thumb_path) ?? null) : null);
};

// 오늘 판정 사용량. 실패하거나 모양이 어긋나면 throw (화면은 표시를 숨긴다)
const getQuota = async (): Promise<PremiumQuotaStatus> => {
  const { data, error } = await supabase.rpc('get_premium_quota', {
    p_feature: FOOD_CHECK_FEATURE,
  });
  const quota = error ? null : parsePremiumQuotaStatus(data);
  if (!quota) throw error ?? new Error('get_premium_quota: invalid response');
  return quota;
};

export const FoodCheckAPI = { check, list, get, getQuota };
