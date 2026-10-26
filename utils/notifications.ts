import { UserAPI } from 'api/UserAPI';
import { Channel, CHANNELS } from 'const/channels';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { FastingDB } from 'types/database';
import { Maybe } from '../types/common';
import { formatMinutes, scheduleFrom } from './fastingSchedule';
import { type PushEnableResult, pushEnableResult } from './pushEnable';
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

const registerChannel = async (channelId: Channel) => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(channelId, {
    name: channelId,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
};

export const registerForPushNotificationsAsync = async (channelId: Channel) => {
  const pushToken = await requestNotificationPermission();
  if (!pushToken) return false;

  await registerChannel(channelId);
  return true;
};

// 사용자가 알림을 켤 때: 권한 요청 + 푸시 토큰 저장 + 채널 등록. 권한을 거부했으면 'denied'
export const enablePushForChannel = async (channelId: Channel): Promise<PushEnableResult> => {
  const registered = await registerForPushNotificationsAsync(channelId).catch(() => false);
  let permission: 'granted' | 'denied' | 'undetermined' = 'undetermined';
  try {
    permission = (await Notifications.getPermissionsAsync()).status;
  } catch {
    // 권한 상태를 못 읽으면 거부로 보지 않는다
    permission = 'granted';
  }
  return pushEnableResult({ isDevice: Device.isDevice, registered, permission });
};

// 알림 권한이 꺼져 있어 알림을 켤 수 없을 때 안내 (휴대폰 설정으로 이동)
export const showNotificationPermissionAlert = () => {
  Alert.alert(
    '알림이 꺼져 있어요',
    '휴대폰 설정에서 스위치온 레시피 알림을 허용하면 매일 아침 체중 기록 알림을 받을 수 있어요.',
    [
      { text: '닫기', style: 'cancel' },
      { text: '설정 열기', onPress: () => Linking.openSettings() },
    ]
  );
};

// 로컬 예약 알림용: 알림 권한(없으면 요청)과 채널만 준비한다. 푸시 토큰은 필요 없다
// (토큰 받기·저장이 실패해도 예약 알림은 걸 수 있어야 한다). 실패하면 false
const prepareLocalNotifications = async (channelId: Channel): Promise<boolean> => {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    await registerChannel(channelId);
    return true;
  } catch (error) {
    captureError({ error, prefix: '[prepareLocalNotifications]: ' });
    return false;
  }
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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
// 이 시각 전에 시작하는 단식은 아침 7시 알림이 늦으니 전날 저녁 21시에 알린다
const EARLY_START_MINUTES = 480;

// 이번 주차(weekFrom부터 7일) 단식마다 알림 한 번: 시작이 08:00 이후면 그날 07:00 "오늘 HH:MM부터",
// 그 전이면 전날 21:00 "내일 HH:MM부터" (KST). 이미 지난 알림과 시각이 없는 요일은 뺀다
export function fastingAlarms(
  fasting: Maybe<Pick<FastingDB, 'days' | 'start_time' | 'start_minutes'>>,
  { now, weekFrom }: { now: Date; weekFrom: string }
): { date: Date; body: string }[] {
  if (!fasting?.days) return [];
  const schedule = scheduleFrom(fasting);
  const [y, m, d] = weekFrom.slice(0, 10).split('-').map(Number);
  const from = Date.UTC(y, m - 1, d);

  const alarms: { date: Date; body: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const dayUtc = from + i * DAY_MS;
    const minutes = schedule[new Date(dayUtc).getUTCDay()];
    if (minutes === undefined) continue;
    const midnight = dayUtc - KST_OFFSET_MS; // 그날 KST 자정
    const early = minutes < EARLY_START_MINUTES;
    const at = early ? midnight - 3 * HOUR_MS : midnight + 7 * HOUR_MS;
    if (at <= now.getTime()) continue;
    alarms.push({
      date: new Date(at),
      body: `${early ? '내일' : '오늘'} ${formatMinutes(minutes)}부터 24시간 단식이 시작돼요.\n단식 후, 첫 끼는 든든하게 챙겨드세요!`,
    });
  }
  return alarms;
}

const FASTING_ALARM_TITLE = '단식 시작 예정 알림';
const FASTING_ALARM_KIND = 'fasting';

// 앱이 건 단식 알림인지: 이번 앱은 data.kind, 옛 앱(반복 WEEKLY 알림)은 제목으로 알아본다
export function isFastingAlarm(request: {
  content: { title?: string | null; data?: Record<string, unknown> | null };
}): boolean {
  return (
    request.content.data?.kind === FASTING_ALARM_KIND ||
    request.content.title === FASTING_ALARM_TITLE
  );
}

// 단식 알림만 지운다 (다른 예약 알림은 그대로)
async function cancelFastingAlarmsNow() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(isFastingAlarm)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier))
  );
}

// 지우고 다시 거는 작업이 겹치면 알림이 두 번 걸릴 수 있어 차례로 실행한다
let fastingAlarmQueue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = fastingAlarmQueue.then(task, task);
  fastingAlarmQueue = run.catch(() => undefined);
  return run;
};

// 이번 주차 단식 알림을 다시 건다. 주차가 바뀌면 단식 설정이 초기화되므로 반복 없이 이번 주차 것만
export function registerWeeklyFastingAlarms(fasting: Maybe<FastingDB>, weekFrom: string) {
  return enqueue(async () => {
    if (!fasting?.days?.length) {
      await cancelFastingAlarmsNow();
      return [];
    }

    // 다시 걸 수 있을 때만 지운다 (권한·채널 준비가 실패하면 있던 알림을 그대로 둔다)
    const isReady = await prepareLocalNotifications(CHANNELS.FASTING);
    if (!isReady) return [];
    // 푸시 토큰 등록은 예전처럼 덤으로 (실패해도 로컬 알림과 상관없다)
    void requestNotificationPermission();
    await cancelFastingAlarmsNow();

    const triggerIds: string[] = [];
    try {
      for (const { date, body } of fastingAlarms(fasting, { now: new Date(), weekFrom })) {
        const triggerId = await Notifications.scheduleNotificationAsync({
          content: { title: FASTING_ALARM_TITLE, body, data: { kind: FASTING_ALARM_KIND } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: CHANNELS.FASTING,
          },
        });
        triggerIds.push(triggerId);
      }
    } catch (error) {
      console.error(error);
    }
    return triggerIds;
  });
}

// 앱을 열거나 돌아올 때: 알림 권한이 이미 있을 때만 이번 주차 단식 알림을 다시 건다 (권한 요청 창 없음).
// 옛 앱이 건 반복 알림도 이때 지워진다. 실패해도 throw하지 않는다
export async function syncFastingAlarms(fasting: Maybe<FastingDB>, weekFrom: string) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await registerWeeklyFastingAlarms(fasting, weekFrom);
  } catch (error) {
    captureError({ error, prefix: '[syncFastingAlarms]: ' });
  }
}

export function cancelFastingAlarms() {
  return enqueue(cancelFastingAlarmsNow);
}

// 디버깅용
async function getScheduledNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  console.log('현재 스케줄된 알림:', scheduled);
  return scheduled;
}
