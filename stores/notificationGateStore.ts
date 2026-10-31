import type { Href } from 'expo-router';
import type { AppRoutePhase } from 'utils/notificationGate';
import { create } from 'zustand';

// 알림을 눌러 열 때 이동을 미뤄 두는 곳 (utils/notificationGate). 저장하지 않는다:
// 앱을 다시 켜면 starting부터
interface NotificationGateState {
  phase: AppRoutePhase;
  pendingHref: Href | null;
  // 로그인·온보딩 뒤에 열 곳 (카톡으로 받은 레시피 등, app/kakaolink). 탭 밖에서도 버리지 않는다
  afterLoginHref: Href | null;
  setPhase: (phase: AppRoutePhase) => void;
  setPendingHref: (href: Href | null) => void;
  setAfterLoginHref: (href: Href | null) => void;
}

export const useNotificationGateStore = create<NotificationGateState>()((set) => ({
  phase: 'starting',
  pendingHref: null,
  afterLoginHref: null,
  setPhase: (phase) => set({ phase }),
  setPendingHref: (pendingHref) => set({ pendingHref }),
  setAfterLoginHref: (afterLoginHref) => set({ afterLoginHref }),
}));
