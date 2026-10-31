// 패스로 쓸 수 있는 기능 (스펙 1절). 패스 화면과 레시피 한도 초과 모달이 같이 쓴다
// inQuotaModal: 레시피 한도 초과 모달의 패스 안내 한 줄에 이름을 넣을 기능
export const PASS_FEATURES = [
  {
    icon: 'storefront',
    title: '편의점 판정',
    description: '먹어도 되는지 바로 확인',
    inQuotaModal: true,
  },
  {
    icon: 'restaurant-menu',
    title: '맞춤 레시피 추천',
    description: '먹고 싶은 걸 고르면 레시피를 골라 드려요',
    inQuotaModal: true,
  },
  {
    icon: 'insights',
    title: 'AI 주간 리포트',
    description: '체중·식단·단식을 한 주씩 정리',
    inQuotaModal: true,
  },
  {
    icon: 'photo-camera',
    title: '인바디 결과지 인식',
    description: '사진만 찍으면 골격근량·체지방량을 기록해요',
    inQuotaModal: false,
  },
] as const;

export const PASS_QUOTA_MODAL_FEATURES: readonly string[] = PASS_FEATURES.filter(
  (f) => f.inQuotaModal
).map((f) => f.title);
