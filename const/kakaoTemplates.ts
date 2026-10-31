// 카카오톡 공유 메시지 템플릿 ID (카카오 개발자 콘솔 > 메시지 템플릿에서 운영자가 만든다).
// 템플릿의 버튼 링크(앱 실행 파라미터)가 app/kakaolink로 들어온다 (utils/kakaoLink)
export const KAKAO_TEMPLATE_IDS = {
  // 레시피 공유. 인자: title, image_uri, recipe(레시피 JSON), description
  recipe: 122968,
} as const;
