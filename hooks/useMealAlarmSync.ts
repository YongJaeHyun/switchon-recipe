import { CHANNELS } from 'const/channels';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDateString } from 'utils/date';
import { checksForSettingSync } from 'utils/mealAlarms';
import { prepareLocalNotifications, syncMealAlarms } from 'utils/notifications';
import { programWeekAndDay, startDateStatus } from 'utils/programStart';

// 내 정보에서 켜기·시각 바꾸기 뒤 바로 맞춘다 (오늘 탭이 아직 안 떠 있어도). 휠을 돌리는 동안
// 매번 28개를 다시 걸지 않게 멈춘 뒤 한 번만
const SETTING_SYNC_DELAY_MS = 800;
let settingSyncTimer: ReturnType<typeof setTimeout> | undefined;
export function syncMealAlarmsSoon() {
  clearTimeout(settingSyncTimer);
  settingSyncTimer = setTimeout(() => {
    const { on, times } = useMealAlarmStore.getState();
    const { start_date: startDate, id: userId } = useUserStore.getState();
    // 유저를 불러오기 전에는 시작일을 모른다: 빈 시작일로 맞추면 걸어 둔 알림을 지운다
    if (startDateStatus({ userId, startDate }) === 'loading') return;
    const { week: storeWeek, day: storeDay } = useWeekCompletePopupStore.getState();
    const today = getKoreanDateString({ formatType: 'date' });
    const { week, day, beforeStart } = programWeekAndDay(startDate, today);
    const checkedToday = checksForSettingSync({
      beforeStart,
      week,
      day,
      storeWeek,
      storeDay,
      cached: queryClient.getQueryData<number[]>([QueryKey.todos, userId]),
    });
    void syncMealAlarms({ on, times, startDate, checkedToday });
  }, SETTING_SYNC_DELAY_MS);
}

// 끼니 알림 켜기 (온보딩·내 정보·시작 전 준비): 알림 권한을 받고, 받으면 켠다. 거부하면 꺼 둔다.
// 켜진 뒤 예약은 useMealAlarmSync가 설정 변경을 보고 맞춘다
export async function turnOnMealAlarm(): Promise<boolean> {
  const granted = await prepareLocalNotifications(CHANNELS.MEAL);
  useMealAlarmStore.getState().setOn(granted);
  return granted;
}

// 1주차 끼니 알림을 맞춘다: 앱을 열 때·돌아올 때, 오늘 체크가 바뀔 때, 설정·시작일이 바뀔 때.
// checkedToday = 오늘 체크한 할 일 id. null이면 아직 오늘 체크를 모른다(불러오는 중·초기화 전) → 기다린다.
// 화면에 하나뿐인 곳에서만 쓴다 (오늘 탭: 시작 전 카드 또는 할 일 목록)
export function useMealAlarmSync(checkedToday: number[] | null, enabled = true) {
  const startDate = useUserStore((state) => state.start_date);
  const userId = useUserStore((state) => state.id);
  // 유저를 불러오기 전(시작일 모름)에는 맞추지 않는다 (빈 시작일 = 알림 없음으로 보고 지우지 않게)
  const startKnown = startDateStatus({ userId, startDate }) !== 'loading';
  const on = useMealAlarmStore((state) => state.on);
  const times = useMealAlarmStore((state) => state.times);
  const [foregroundAt, setForegroundAt] = useState(0);
  // 저장된 설정을 읽기 전(on=false 기본값)에 맞추면 걸어 둔 알림을 지웠다 다시 건다 → 읽은 뒤에만
  const [hydrated, setHydrated] = useState(() => useMealAlarmStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = useMealAlarmStore.persist.onFinishHydration(() => setHydrated(true));
    // 처음 읽은 뒤 구독하기 전에 끝났을 수 있다
    if (useMealAlarmStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, [enabled]);

  const checkedKey = checkedToday ? [...checkedToday].sort((a, b) => a - b).join(',') : null;
  useEffect(() => {
    if (!enabled || !hydrated || !startKnown || checkedKey === null) return;
    const checked = checkedKey === '' ? [] : checkedKey.split(',').map(Number);
    void syncMealAlarms({ on, times, startDate, checkedToday: checked });
  }, [enabled, hydrated, startKnown, on, times, startDate, checkedKey, foregroundAt]);
}
