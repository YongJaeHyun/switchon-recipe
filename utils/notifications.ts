import { UserAPI } from 'api/UserAPI';
import { Channel, CHANNELS } from 'const/channels';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { Maybe } from '../types/common';
import { formatMinutes, scheduleFrom } from './fastingSchedule';
import { captureError } from './sendError';

const requestNotificationPermission = async () => {
  if (!Device.isDevice) return;

  const pushTokenLocal = useUserStore.getState().push_token;
  if (pushTokenLocal) return pushTokenLocal;

  try {
    let finalStatus = null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) throw new Error('Project ID not found');

    const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await UserAPI.updatePushToken(pushToken);
    return pushToken;
  } catch (error) {
    captureError({ error, prefix: '[registerForPushNotificationsAsync]: ' });
  }
};

export const registerForPushNotificationsAsync = async (channelId: Channel) => {
  const pushToken = await requestNotificationPermission();
  if (!pushToken) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: channelId,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
  return true;
};

// 알림 권한이 이미 있을 때만 채널을 등록한다 (권한 요청 창을 띄우지 않는다).
// 화면을 열 때처럼 사용자가 알림을 고른 적 없는 곳에서 쓴다. 실패해도 throw하지 않는다
export const registerChannelIfPermitted = async (channelId: Channel): Promise<boolean> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false;
    return await registerForPushNotificationsAsync(channelId);
  } catch (error) {
    captureError({ error, prefix: '[registerChannelIfPermitted]: ' });
    return false;
  }
};

// 단식 요일마다 그날 아침 알림: 요일(1=일..7=토)과 그 요일 시작 시각 문구. 시각이 없는 요일은 뺀다
export function fastingAlarms(
  fasting: Maybe<Pick<FastingDB, 'days' | 'start_time' | 'start_minutes'>>
): { weekday: number; body: string }[] {
  if (!fasting?.days) return [];
  const schedule = scheduleFrom(fasting);
  return fasting.days
    .filter((day) => schedule[day] !== undefined)
    .map((day) => ({
      weekday: day + 1,
      body: `오늘 ${formatMinutes(schedule[day])}부터 24시간 단식이 시작돼요.\n단식 후, 첫 끼는 든든하게 챙겨드세요!`,
    }));
}

export async function registerWeeklyFastingAlarms(fasting: Maybe<FastingDB>) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!fasting?.days) return [];

  const isSuccess = await registerForPushNotificationsAsync(CHANNELS.FASTING);
  if (!isSuccess) return [];

  const triggerIds: string[] = [];

  try {
    for (const { weekday, body } of fastingAlarms(fasting)) {
      const triggerId = await Notifications.scheduleNotificationAsync({
        content: { title: '단식 시작 예정 알림', body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday, // 1=일, 2=월, ..., 7=토
          hour: 7,
          minute: 0,
          channelId: CHANNELS.FASTING,
        },
      });

      triggerIds.push(triggerId);
    }
  } catch (error) {
    console.error(error);
  }

  // await getScheduledNotifications();
  return triggerIds;
}

export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// 디버깅용
async function getScheduledNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  console.log('현재 스케줄된 알림:', scheduled);
  return scheduled;
}
