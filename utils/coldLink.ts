// 앱이 꺼진 상태에서 링크(switchon-recipe://pass 등)로 열 때 어디로 갈지 (순수). app/+native-intent.tsx가 쓴다.
// 링크 화면으로 바로 가면 사용자 정보를 불러오는 시작 화면(app/index)을 건너뛰어 사용자가 비고 스플래시도
// 닫히지 않는다 (최종 리뷰 #3 M-2). 그래서 시작 화면(/)으로 열고 주소는 알림 이동처럼 미뤄 둔다
// (stores/notificationGateStore pendingHref → hooks/useNotificationObserver가 탭이 뜬 뒤 연다, 탭 밖이면 버린다).
// 그대로 두는 것: 앱이 켜져 있을 때 링크(initial 아님), 카카오 링크(app/kakaolink가 직접 처리),
// 시작 화면 주소, 개발 빌드 실행 주소, 웹 주소.

export interface ColdLinkDecision {
  path: string; // expo-router에 돌려줄 주소
  pendingHref: string | null; // 사용자 정보를 불러온 뒤 열 주소
}

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;
const PASS_THROUGH_SCHEMES = new Set(['exp', 'exps', 'http', 'https']);
const PASS_THROUGH_FIRST_SEGMENTS = new Set(['kakaolink', 'expo-development-client']);

export function coldLinkRedirect({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): ColdLinkDecision {
  const keep = { path, pendingHref: null };
  if (!initial || !path) return keep;

  let rest = path;
  const match = SCHEME.exec(path);
  if (match) {
    const scheme = match[1].toLowerCase();
    if (scheme.startsWith('exp+') || PASS_THROUGH_SCHEMES.has(scheme)) return keep;
    rest = match[2];
  }
  // switchon-recipe://pass 는 host가 첫 경로다 (expo-router와 같게)
  const route = `/${rest.replace(/^\/+/, '')}`;
  const firstSegment = route.slice(1).split(/[/?#]/)[0];
  if (!firstSegment) return keep;
  if (PASS_THROUGH_FIRST_SEGMENTS.has(firstSegment)) return keep;
  return { path: '/', pendingHref: route };
}
