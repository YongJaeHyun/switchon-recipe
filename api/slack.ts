import axios from 'axios';
import { captureError } from 'utils/sendError';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

const BASE_URL = process.env.EXPO_PUBLIC_SLACK_WEBHOOK_URL;

const sendSlackMessage = async (text: string) => {
  try {
    const res = await axios.post(BASE_URL, { text });
    if (res.status === 200) {
      showSuccessToast({ textType: 'INGREDIENT_REQUEST_SUCCESS' });
    }
  } catch (error) {
    captureError({ error, prefix: '[Slack Webhook]: ', level: 'fatal' });
    showErrorToast({ textType: 'INGREDIENT_REQUEST_ERROR' });
  }
};

export { sendSlackMessage };
