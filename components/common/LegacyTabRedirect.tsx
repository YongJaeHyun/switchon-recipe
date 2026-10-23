import { router } from 'expo-router';
import { useEffect } from 'react';
import { LEGACY_TAB_HREFS } from 'utils/notificationHref';

// 탭으로 옮긴 예전 주소(/weight·/report·/profile) 화면.
// <Redirect>(replace)는 이 화면 자리에 (tabs)를 새로 하나 더 쌓아서, 뒤로 가기가 겹친 탭을 거쳤다.
// dismissTo(POP_TO)는 한 번에 이 화면을 빼고 이미 있는 (tabs)로 돌아가 탭·칸만 바꾼다.
// 아래에 (tabs)가 없으면(앱을 이 주소로 켬) 이 화면을 (tabs)로 바꾼다
export function LegacyTabRedirect({ path }: { path: keyof typeof LEGACY_TAB_HREFS }) {
  useEffect(() => {
    router.dismissTo(LEGACY_TAB_HREFS[path]);
  }, [path]);
  return null;
}
