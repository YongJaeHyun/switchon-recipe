import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect } from 'react';
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

const foregroundAndBackgroundObserver = () => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const href = response.notification.request.content.data?.href as Maybe<Href>;
    invalidateWeeklyReportsFor(href);
    if (href) openHref(href);
  });

  return subscription;
};

const terminatedObserver = async () => {
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    const href = lastResponse.notification.request.content.data?.href as Maybe<Href>;
    if (href) openHref(href);
  }
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

    terminatedObserver();

    return () => {
      subscription.remove();
      received.remove();
    };
  }, []);
}
