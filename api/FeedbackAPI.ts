import axios from 'axios';
import type { ReviewTrigger } from 'utils/reviewPrompt';
import { classifyFoodCheckRequestError } from 'utils/foodCheckResponse';
import { captureError } from 'utils/sendError';
import { UserAPI } from './UserAPI';

const TIMEOUT_MS = 15 * 1000;

export type SendFeedbackOutcome =
  | { status: 'ok' }
  // 오늘 이미 보냄 (서버 문구 그대로 보여준다)
  | { status: 'rate_limited'; message: string }
  | { status: 'network' }
  | { status: 'error' };

const RATE_LIMIT_FALLBACK = '오늘은 이미 의견을 보내 주셨어요. 내일 다시 보내 주세요';

// 리뷰 묻기 [아쉬워요] 의견 보내기 (send-feedback). 던지지 않는다
const send = async (body: {
  message: string;
  trigger: ReviewTrigger;
  app_version: string;
  week: number | null;
  has_pass: boolean | null;
}): Promise<SendFeedbackOutcome> => {
  try {
    const session = await UserAPI.getSession();
    const response = await axios.post(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-feedback`,
      body,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
    if (response.status === 200) return { status: 'ok' };
    if (response.status === 429) {
      const message = response.data?.message;
      return {
        status: 'rate_limited',
        message: typeof message === 'string' && message ? message : RATE_LIMIT_FALLBACK,
      };
    }
    captureError({
      error: new Error(`send-feedback ${response.status}: ${JSON.stringify(response.data)}`),
      prefix: '[FeedbackAPI.send]: ',
    });
    return { status: 'error' };
  } catch (error) {
    const kind = classifyFoodCheckRequestError(error);
    if (kind === 'network' || kind === 'timeout') return { status: 'network' };
    captureError({ error, prefix: '[FeedbackAPI.send]: ' });
    return { status: 'error' };
  }
};

export const FeedbackAPI = { send };
