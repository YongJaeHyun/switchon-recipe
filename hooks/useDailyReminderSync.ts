import { useUserSetting } from 'hooks/useWeights';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { weightReminderOnFrom } from 'utils/dailyReminder';
import { syncDailyReminder } from 'utils/notifications';

// 다음 날 아침 리마인드를 앱을 열 때·돌아올 때·시작일이 바뀔 때 맞춘다 (오늘 것 취소, 내일 09:00 KST 것 예약).
// 체중 기록 알림(09:00 서버 푸시)이 켜져 있거나 그 설정을 아직 모르면 걸지 않고 지우기만 한다
// (같은 시각 배너 두 개 방지). 내 정보 토글·체중 입력에서 바꾸면 캐시가 바뀌어 다시 맞춘다.
// 로그인 뒤 탭 화면에 하나만 둔다 (app/(tabs)/_layout)
export function useDailyReminderSync() {
  const startDate = useUserStore((state) => state.start_date);
  const { setting } = useUserSetting();
  const weightReminderOn = weightReminderOnFrom(setting);
  const [foregroundAt, setForegroundAt] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void syncDailyReminder({ startDate, weightReminderOn });
  }, [startDate, weightReminderOn, foregroundAt]);
}
