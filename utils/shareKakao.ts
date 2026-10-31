import { shareCustomTemplate, shareFeedTemplate } from '@react-native-kakao/share';
import { KAKAO_TEMPLATE_IDS, type KakaoTemplateKey } from 'const/kakaoTemplates';
import { useUserStore } from 'stores/userStore';
import { getKoreanDateString } from './date';
import { feedTemplate, inviteMessage, type KakaoShareMessage } from './kakaoShare';
import { captureError } from './sendError';
import { showErrorToast } from './showToast';

// 카톡 공유 창 열기. 콘솔 템플릿 ID가 있으면 그 템플릿에 인자로, 없으면 같은 내용을 기본 피드 메시지로 보낸다.
// 템플릿 인자: title, description, image_url, button_title + 실행 파라미터 (const/kakaoTemplates)
export async function shareKakaoMessage(key: KakaoTemplateKey, message: KakaoShareMessage) {
  try {
    const templateId: number | null = KAKAO_TEMPLATE_IDS[key];
    if (templateId) {
      await shareCustomTemplate({
        templateId,
        templateArgs: {
          title: message.title,
          description: message.description,
          image_url: message.imageUrl,
          button_title: message.buttonTitle,
          ...message.params,
        },
      });
    } else {
      await shareFeedTemplate({ template: feedTemplate(message) });
    }
  } catch (error) {
    captureError({ error, prefix: `[shareKakao:${key}]: ` });
    showErrorToast({ textType: 'CUSTOM', title: '카카오톡 공유를 열지 못했어요' });
  }
}

// 같이 하자 초대: 내 시작일을 실어 보낸다 (내 정보·시작 전 카드·완주 축하)
export function shareInvite() {
  const startDate = useUserStore.getState().start_date;
  if (!startDate) return;
  const today = getKoreanDateString({ formatType: 'date' });
  return shareKakaoMessage('invite', inviteMessage({ startDate, today }));
}
