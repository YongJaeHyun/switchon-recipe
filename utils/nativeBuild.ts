import { requireOptionalNativeModule } from 'expo';

// 지금 돌고 있는 스토어(네이티브) 빌드가 최신(6.1.0 이상)인지. OTA로 JS를 받아도 네이티브 부품은 바뀌지 않으므로
// 6.1.0 빌드에 처음 들어간 화면 꺼짐 방지 모듈(ExpoKeepAwake)이 있는지로 판단한다.
// 다음에 필수 업데이트를 또 쓰면, 그 빌드에 새로 들어간 네이티브 모듈로 바꾼다
export const hasLatestNativeBuild = (): boolean =>
  requireOptionalNativeModule('ExpoKeepAwake') != null;
