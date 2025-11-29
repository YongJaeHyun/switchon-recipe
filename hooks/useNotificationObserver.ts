import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Maybe } from '../types/common';

const foregroundAndBackgroundObserver = () => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const href = response.notification.request.content.data?.href as Maybe<Href>;
    if (href) router.push(href);
  });

  return subscription;
};

const terminatedObserver = async () => {
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    const href = lastResponse.notification.request.content.data?.href as Maybe<Href>;
    if (href) router.push(href);
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

    terminatedObserver();

    return () => subscription.remove();
  }, []);
}
