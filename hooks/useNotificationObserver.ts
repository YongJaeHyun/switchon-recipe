import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import { useUserStore } from 'stores/userStore';
import { getKoreanDateString } from 'utils/date';
import { inviteNotice } from 'utils/kakaoShare';
import { afterLoginLinkAction, notificationTapAction } from 'utils/notificationGate';
import { captureError } from 'utils/sendError';
import { Maybe } from '../types/common';
import { resolveNotificationHref } from '../utils/notificationHref';
import { invalidateWeeklyReportsFor } from './useWeeklyReports';

// 탭으로 옮긴 예전 주소는 이미 있는 (tabs) 안에서 탭만 바꾸고(navigate), 나머지는 push
const openHref = (raw: Href) => {
  if (typeof raw !== 'string') return router.push(raw);
  const { href, tab } = resolveNotificationHref(raw);
  if (tab) router.navigate(href);
  else router.push(href);
};

// 미뤄 둔 알림 이동을 지금 할 수 있으면 한다: 사용자 정보를 불러와 탭 화면이 뜬 뒤에만 (utils/notificationGate).
// 탭 밖(로그인·온보딩)이면 버린다
const flushPendingHref = () => {
  const { phase, pendingHref, setPendingHref } = useNotificationGateStore.getState();
  if (!pendingHref) return;
  const { id, is_onboarded } = useUserStore.getState();
  const action = notificationTapAction({ phase, userId: id, isOnboarded: is_onboarded });
  if (action === 'wait') return;
  setPendingHref(null);
  if (action === 'open') openHref(pendingHref);
};

// 로그인·온보딩 뒤로 미룬 이동 (카톡으로 받은 레시피, app/kakaolink): 탭 밖이면 버리지 않고 탭이 뜰 때까지 기다린다
const flushAfterLoginHref = () => {
  const { phase, afterLoginHref, setAfterLoginHref } = useNotificationGateStore.getState();
  if (!afterLoginHref) return;
  const { id, is_onboarded } = useUserStore.getState();
  if (afterLoginLinkAction({ phase, userId: id, isOnboarded: is_onboarded }) !== 'open') return;
  setAfterLoginHref(null);
  openHref(afterLoginHref);
};

// 카톡으로 받은 같이 하자 초대가 남았는데 탭이 떴으면 이미 시작일이 있는 사람이다 (새 사용자는 온보딩이 쓰고 지운다).
// 시작일은 그대로 두고 친구 시작일만 알려 준다
const flushPendingInvite = () => {
  const { phase, pendingInvite, setPendingInvite } = useNotificationGateStore.getState();
  if (!pendingInvite) return;
  const { id, is_onboarded } = useUserStore.getState();
  if (afterLoginLinkAction({ phase, userId: id, isOnboarded: is_onboarded }) !== 'open') return;
  setPendingInvite(null);
  const notice = inviteNotice(pendingInvite, getKoreanDateString({ formatType: 'date' }));
  // 토스트는 링크로 화면이 다시 그려질 때 사라질 수 있어 닫을 때까지 남는 알림창으로
  if (notice) Alert.alert(notice.title, notice.subtitle, [{ text: '확인' }]);
};

const flushDeferredHrefs = () => {
  flushPendingHref();
  flushAfterLoginHref();
  flushPendingInvite();
};

// 누른 알림 처리: 이동은 미뤄 두고, 같은 알림을 다시 처리하지 않게(개발 중 다시 불러오기·안드로이드 재실행) 지운다
const handleTap = (response: Notifications.NotificationResponse) => {
  const href = response.notification.request.content.data?.href as Maybe<Href>;
  invalidateWeeklyReportsFor(href);
  if (href) {
    useNotificationGateStore.getState().setPendingHref(href);
    flushPendingHref();
  }
  Notifications.clearLastNotificationResponseAsync().catch((error) =>
    captureError({ error, prefix: '[clearLastNotificationResponse]: ' })
  );
};

const foregroundAndBackgroundObserver = () =>
  Notifications.addNotificationResponseReceivedListener(handleTap);

const terminatedObserver = async () => {
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) handleTap(lastResponse);
};

export function useNotificationObserver() {
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const subscription = foregroundAndBackgroundObserver();
    // 앱이 열려 있을 때 리포트 알림이 오면 리포트 목록을 다시 받는다
    const received = Notifications.addNotificationReceivedListener((notification) =>
      invalidateWeeklyReportsFor(notification.request.content.data?.href)
    );
    // 탭 화면이 뜨거나(phase) 사용자 정보가 바뀌면 미뤄 둔 이동(알림·카톡 링크)을 다시 본다
    const unsubscribeGate = useNotificationGateStore.subscribe(flushDeferredHrefs);
    const unsubscribeUser = useUserStore.subscribe(flushDeferredHrefs);

    terminatedObserver();

    return () => {
      subscription.remove();
      received.remove();
      unsubscribeGate();
      unsubscribeUser();
    };
  }, []);
}
