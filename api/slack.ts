import axios from 'axios';
import { captureError } from 'utils/sendError';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

const BASE_URL = process.env.EXPO_PUBLIC_SLACK_WEBHOOK_URL;

const sendSlackMessage = async (text: string) => {
  try {
    const res = await axios.post(BASE_URL, { text });
    if (res.status === 200) {
      showSuccessToast({ text1: '재료 요청 성공', text2: '소중한 의견 감사합니다 :)' });
    }
  } catch (error) {
    captureError({ error, prefix: '[Slack Webhook]: ', level: 'fatal' });
    showErrorToast({
      text1: '요청 에러 발생',
      text2: '에러 정보가 관리자에게 전달되었습니다. 빠른 시일 내에 조치하겠습니다 :)',
      error,
    });
  }
};

export { sendSlackMessage };
