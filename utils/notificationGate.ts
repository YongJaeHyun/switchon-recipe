// 알림을 눌러 앱을 열 때 화면 이동을 언제 할지 (순수). 상태는 stores/notificationGateStore,
// 이동은 hooks/useNotificationObserver.
// phase: starting = 앱 시작 화면(app/index)이 사용자 정보를 불러오는 중, tabs = 탭 화면이 떠 있음,
// outside = 로그인·온보딩·첫 안내 화면 (탭 밖)
export type AppRoutePhase = 'starting' | 'tabs' | 'outside';

export type NotificationTapAction = 'open' | 'wait' | 'drop';

// 사용자 정보를 불러오기 전에 오늘 탭으로 가면 빈 시작일로 1주차가 잠깐 보인다 → 탭이 뜰 때까지 기다린다.
// 탭 밖이면 버린다 (로그아웃·온보딩 전 사람을 탭으로 보내지 않는다. 갈 곳은 app/index가 정한다)
export function notificationTapAction({
  phase,
  userId,
  isOnboarded,
}: {
  phase: AppRoutePhase;
  userId: string | null | undefined;
  isOnboarded: boolean | null | undefined;
}): NotificationTapAction {
  if (phase === 'outside') return 'drop';
  if (phase === 'tabs' && userId && isOnboarded) return 'open';
  return 'wait';
}

// 앱 시작 화면이 사용자 정보를 불러온 뒤의 phase. 탭으로 보내면 탭이 뜰 때까지(starting) 기다린다
export function startupPhase({
  isFirstLaunch,
  isLoggedIn,
  isOnboarded,
}: {
  isFirstLaunch: boolean;
  isLoggedIn: boolean;
  isOnboarded: boolean | null | undefined;
}): AppRoutePhase {
  return !isFirstLaunch && isLoggedIn && isOnboarded ? 'starting' : 'outside';
}
