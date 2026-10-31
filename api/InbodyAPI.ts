import axios from 'axios';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { type InbodyReadOutcome, interpretInbodyResponse } from 'utils/inbodyRead';
import { showNetworkErrorToast } from 'utils/network';
import { captureError } from 'utils/sendError';
import { showErrorToast } from 'utils/showToast';
import { UserAPI } from './UserAPI';

// Gemini 읽기를 기다린다 (서버는 30초에서 끊는다)
const REQUEST_TIMEOUT_MS = 45 * 1000;
const ERROR_TITLE = '결과지 읽기 실패';
const ERROR_SUBTITLE = '결과지를 읽지 못했어요. 잠시 후 다시 시도해 주세요';

// 인바디 결과지 사진 읽기 (read-inbody). 서버가 정한 결과(성공/429/413/400/500)는 InbodyReadOutcome으로
// 돌려주고 시트가 안내한다. 네트워크 오류·시간 초과는 여기서 안내(취소는 조용히)하고 undefined.
// 서버는 사진·결과를 저장하지 않는다 (시트가 칸을 채우고 사용자가 저장한다)
const read = async (
  image: { imageBase64: string; mimeType: string },
  signal?: AbortSignal
): Promise<InbodyReadOutcome | undefined> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/read-inbody`,
      image,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        signal,
        timeout: REQUEST_TIMEOUT_MS,
        // 상태 코드별 해석은 interpretInbodyResponse가 한다
        validateStatus: () => true,
      }
    );
    const outcome = interpretInbodyResponse(response.status, response.data);
    if (outcome.status === 'error') {
      captureError({
        error: new Error(`read-inbody ${response.status}: ${JSON.stringify(response.data)}`),
        prefix: '[InbodyAPI.read]: ',
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
    if (kind !== 'timeout') captureError({ error, prefix: '[InbodyAPI.read]: ' });
    showErrorToast({ textType: 'CUSTOM', title: ERROR_TITLE, subtitle: ERROR_SUBTITLE });
    return undefined;
  }
};

export const InbodyAPI = { read };
