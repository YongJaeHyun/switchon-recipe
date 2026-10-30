import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { syncDailyReminder } from 'utils/notifications';

// 다음 날 아침 리마인드를 앱을 열 때·돌아올 때·시작일이 바뀔 때 맞춘다 (오늘 것 취소, 내일 09:00 KST 것 예약).
// 로그인 뒤 탭 화면에 하나만 둔다 (app/(tabs)/_layout)
export function useDailyReminderSync() {
  const startDate = useUserStore((state) => state.start_date);
  const [foregroundAt, setForegroundAt] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void syncDailyReminder({ startDate });
  }, [startDate, foregroundAt]);
}
