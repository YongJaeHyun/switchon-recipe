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

// 카톡 공유 이미지 (800×400 가로형, 2배 해상도). Supabase 공개 버킷 share-images에 올려 둔다.
// 원본은 docs/share-images/ (HTML로 그려 PNG로 저장). 이미지를 바꾸면 v2/처럼 새 폴더에 올려 카톡 캐시를 피한다
const SHARE_IMAGE_BASE =
  'https://hhewuyfclrapnchhltod.supabase.co/storage/v1/object/public/share-images/v1/';

export type ShareImageName =
  | 'invite'
  | `completion-${1 | 2 | 3 | 4 | 5}`
  | `foodcheck-${'ok' | 'caution' | 'avoid'}`;

export const shareImageUrl = (name: ShareImageName) => `${SHARE_IMAGE_BASE}${name}.png`;
