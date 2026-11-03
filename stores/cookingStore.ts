import { CHANNELS } from 'const/channels';
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';
import {
  type CookingTimer,
  newTimer,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  timerKey,
  timerState,
} from 'utils/cookingTimer';
import { prepareLocalNotifications } from 'utils/notifications';
import { captureError } from 'utils/sendError';
import { create } from 'zustand';

// 조리 순서 타이머와 요리 모드에서 마지막으로 본 단계 (이번 실행 동안만, 서버·기기에 저장하지 않음).
// 상세 화면의 타이머 칩과 요리 모드의 타이머 카드가 같은 타이머를 쓴다.
// 끝나면 진동 + 로컬 알림(앱이 백그라운드여도 온다). 요리 모드를 닫으면 그 레시피의 타이머와 알림을 지운다
const COOKING_TIMER_KIND = 'cookingTimer';
const VIBRATION_PATTERN = [0, 500, 300, 500, 300, 500];

interface CookingState {
  timers: Record<string, CookingTimer>;
  // 타이머 키 → 예약된 알림 id
  alarms: Record<string, string>;
  // 진동을 이미 울린 타이머 (상세·요리 모드가 함께 떠 있어도 한 번만)
  rung: Record<string, true>;
  lastStep: Record<number, number>;
}

export const useCookingStore = create<CookingState>()(() => ({
  timers: {},
  alarms: {},
  rung: {},
  lastStep: {},
}));

const set = useCookingStore.setState;
const get = useCookingStore.getState;

async function cancelAlarm(key: string) {
  const id = get().alarms[key];
  if (!id) return;
  set((s) => {
    const { [key]: _removed, ...alarms } = s.alarms;
    return { alarms };
  });
  await Notifications.cancelScheduledNotificationAsync(id).catch((error) =>
    captureError({ error, prefix: '[cookingTimer cancel]: ' })
  );
}

async function scheduleAlarm(timer: CookingTimer, recipeName: string) {
  if (remainingMs(timer, Date.now()) <= 0) return;
  // 권한이 없으면 처음 타이머를 켤 때 한 번 묻는다. 거부해도 화면 안 타이머와 진동은 그대로 돈다
  const ready = await prepareLocalNotifications(CHANNELS.COOKING);
  if (!ready) return;
  // 권한 창을 보는 동안 시간이 흘렀으니 남은 시간은 지금 다시 잰다 (늦게 울리지 않게)
  const latest = get().timers[timer.key];
  if (!latest || timerState(latest, Date.now()) !== 'running') return;
  const left = Math.round(remainingMs(latest, Date.now()) / 1000);
  if (left <= 0) return;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏱ ${timer.label} 타이머가 끝났어요`,
        body: `${recipeName} ${timer.stepIndex + 1}단계를 확인해 주세요`,
        data: { kind: COOKING_TIMER_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: left,
        channelId: CHANNELS.COOKING,
      },
    });
    // 알림을 거는 사이에 멈추거나 지웠으면 바로 취소
    const now = get().timers[timer.key];
    if (!now || timerState(now, Date.now()) !== 'running') {
      await Notifications.cancelScheduledNotificationAsync(id);
      return;
    }
    // 빠르게 멈췄다 다시 켜서 알림 걸기가 겹쳤으면, 먼저 걸린 알림은 지우고 이번 것만 남긴다 (두 번 울리지 않게)
    const previous = get().alarms[timer.key];
    if (previous && previous !== id) {
      await Notifications.cancelScheduledNotificationAsync(previous).catch(() => {});
    }
    set((s) => ({ alarms: { ...s.alarms, [timer.key]: id } }));
  } catch (error) {
    captureError({ error, prefix: '[cookingTimer schedule]: ' });
  }
}

const putTimer = (timer: CookingTimer) =>
  set((s) => {
    const { [timer.key]: _rung, ...rung } = s.rung;
    return { timers: { ...s.timers, [timer.key]: timer }, rung };
  });

export function startTimer(
  args: { recipeId: number; stepIndex: number; label: string; seconds: number },
  recipeName: string
) {
  const timer = newTimer(args, Date.now());
  void cancelAlarm(timer.key).then(() => scheduleAlarm(timer, recipeName));
  putTimer(timer);
}

export function pauseCookingTimer(key: string) {
  const timer = get().timers[key];
  if (!timer) return;
  putTimer(pauseTimer(timer, Date.now()));
  void cancelAlarm(key);
}

export function resumeCookingTimer(key: string, recipeName: string) {
  const timer = get().timers[key];
  if (!timer) return;
  const resumed = resumeTimer(timer, Date.now());
  putTimer(resumed);
  void scheduleAlarm(resumed, recipeName);
}

export function restartCookingTimer(key: string, recipeName: string) {
  const timer = get().timers[key];
  if (!timer) return;
  const restarted = resetTimer(timer, Date.now());
  putTimer(restarted);
  void cancelAlarm(key).then(() => scheduleAlarm(restarted, recipeName));
}

export function removeCookingTimer(key: string) {
  set((s) => {
    const { [key]: _removed, ...timers } = s.timers;
    return { timers };
  });
  void cancelAlarm(key);
}

// 요리 모드를 닫을 때: 이 레시피의 타이머와 남은 알림을 모두 지운다
export function clearRecipeTimers(recipeId: number) {
  Object.values(get().timers)
    .filter((t) => t.recipeId === recipeId)
    .forEach((t) => removeCookingTimer(t.key));
}

// 끝난 타이머마다 한 번 진동한다 (화면이 1초마다 부른다)
export function ringFinishedTimers(now: number) {
  const { timers, rung } = get();
  const finished = Object.values(timers).filter(
    (t) => !rung[t.key] && timerState(t, now) === 'done'
  );
  if (!finished.length) return;
  set((s) => ({
    rung: { ...s.rung, ...Object.fromEntries(finished.map((t) => [t.key, true as const])) },
  }));
  Vibration.vibrate(VIBRATION_PATTERN);
}

export const setLastStep = (recipeId: number, stepIndex: number) =>
  set((s) => ({ lastStep: { ...s.lastStep, [recipeId]: stepIndex } }));

export { timerKey };
