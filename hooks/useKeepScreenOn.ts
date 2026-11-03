import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';

// 요리하는 동안 화면이 꺼지지 않게 한다 (expo-keep-awake).
// 네이티브 모듈은 expo-keep-awake를 직접 의존성으로 넣은 뒤의 스토어 빌드부터 들어 있다. 그 전 빌드(OTA로만 받은 앱)에는
// 없어서 불러오기만 해도 오류가 나므로, 있을 때만 쓰고 없으면 아무것도 하지 않는다 (false를 돌려준다)
const keepAwakeAvailable = requireOptionalNativeModule('ExpoKeepAwake') != null;

export function useKeepScreenOn(tag: string): boolean {
  useEffect(() => {
    if (!keepAwakeAvailable) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const KeepAwake: typeof import('expo-keep-awake') = require('expo-keep-awake');
    KeepAwake.activateKeepAwakeAsync(tag).catch(() => {});
    return () => {
      KeepAwake.deactivateKeepAwake(tag).catch(() => {});
    };
  }, [tag]);
  return keepAwakeAvailable;
}
