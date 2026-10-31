// 카카오톡 공유 메시지 템플릿 ID (카카오 개발자 콘솔 > 메시지 템플릿에서 운영자가 만든다).
// 템플릿의 버튼 링크(앱 실행 파라미터)가 app/kakaolink로 들어온다 (utils/kakaoLink).
// null = 아직 콘솔 템플릿이 없음 → 같은 내용을 기본 피드 메시지(shareFeedTemplate)로 보낸다 (utils/shareKakao).
// 템플릿을 만들면 ID만 넣으면 된다. 인자 이름은 utils/kakaoShare의 KakaoShareMessage를 따른다:
// title, description, image_url, button_title + 실행 파라미터 (invite 등)
export const KAKAO_TEMPLATE_IDS = {
  // 레시피 공유. 인자: title, image_uri, recipe(레시피 JSON), description
  recipe: 122968,
  // 같이 하자 초대. 실행 파라미터 invite=${invite}
  invite: null,
  // 완주 인증 (자랑하기). 실행 파라미터 share=completion (앱만 연다)
  completion: null,
  // 편의점 판정 결과. 실행 파라미터 foodCheck=1 (받은 사람은 편의점 판정 화면)
  foodCheck: null,
} as const satisfies Record<string, number | null>;

export type KakaoTemplateKey = keyof typeof KAKAO_TEMPLATE_IDS;

// 메시지 이미지로 쓰는 앱 아이콘 (플레이 스토어에 올라간 아이콘, 512×512).
// 스토어 아이콘을 바꾸면 이 주소도 바뀔 수 있다
export const APP_LOGO_URL =
  'https://play-lh.googleusercontent.com/mZzUyrGbsgVll_FhWIKCm8EM6Ibiwq3e7PgaIYgbwfDDHRSNrBb9h-ebFWQ6_aVnDpb_fj_KMyy5fiOsSfObZA=w512';
