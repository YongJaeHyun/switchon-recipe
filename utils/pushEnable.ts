export type PushEnableResult = 'enabled' | 'denied' | 'unavailable';

// 알림을 켤 때 푸시를 실제로 받을 수 있는지.
// - enabled: 푸시 토큰을 받아 저장함
// - denied: 휴대폰 알림 권한이 없음 → 켜지 말고 설정에서 허용하도록 안내
// - unavailable: 권한은 있는데 토큰을 못 받음(네트워크·에뮬레이터 등) → 설정은 켜 두고 다음에 다시 받는다
export function pushEnableResult({
  isDevice,
  registered,
  permission,
}: {
  isDevice: boolean;
  registered: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
}): PushEnableResult {
  if (registered) return 'enabled';
  if (isDevice && permission !== 'granted') return 'denied';
  return 'unavailable';
}
