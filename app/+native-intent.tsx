import type { Href } from 'expo-router';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import { coldLinkRedirect } from 'utils/coldLink';
import { captureError } from 'utils/sendError';

// 시스템이 넘긴 링크를 열기 전에 고친다 (expo-router +native-intent).
// 앱이 꺼진 상태에서 연 링크는 시작 화면(/)으로 열고 주소는 미뤄 둔다: app/index가 사용자 정보를 불러오고
// 스플래시를 닫은 뒤, 알림 이동과 같은 길(hooks/useNotificationObserver)로 연다 (utils/coldLink)
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const decision = coldLinkRedirect({ path, initial });
    if (decision.pendingHref) {
      useNotificationGateStore.getState().setPendingHref(decision.pendingHref as Href);
    }
    return decision.path;
  } catch (error) {
    captureError({ error, prefix: '[redirectSystemPath]: ' });
    return path;
  }
}
