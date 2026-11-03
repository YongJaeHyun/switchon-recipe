// 패스로 쓸 수 있는 기능 (스펙 1절). 패스 화면과 레시피 한도 초과 모달이 같이 쓴다.
// id: 패스 화면 갤러리·"패스 기능이에요" 창의 실제 화면 이미지(const/passFeatureImages)와 잇는 키
// inQuotaModal: 레시피 한도 초과 모달의 패스 안내 한 줄에 이름을 넣을 기능
export const PASS_FEATURES = [
  {
    id: 'foodCheck',
    icon: 'fact-check',
    title: '음식 판정',
    description: '사진 한 장으로 먹어도 되는지 확인',
    inQuotaModal: true,
  },
  {
    id: 'byName',
    icon: 'edit-note',
    title: '먹고 싶은 음식으로 만들기',
    description: '이름만 적으면 스위치온식 레시피로 만들어 드려요',
    inQuotaModal: false,
  },
  {
    id: 'recommend',
    icon: 'restaurant-menu',
    title: '맞춤 레시피 추천',
    description: '먹고 싶은 걸 고르면 레시피를 골라 드려요',
    inQuotaModal: true,
  },
  {
    id: 'report',
    icon: 'insights',
    title: 'AI 주간 리포트',
    description: '체중·식단·단식을 유지기 첫 주까지 한 주씩 정리',
    inQuotaModal: true,
  },
  {
    id: 'inbody',
    icon: 'photo-camera',
    title: '인바디 결과지 인식',
    description: '사진만 찍으면 골격근량·체지방량을 기록해요',
    inQuotaModal: false,
  },
] as const;

export const PASS_QUOTA_MODAL_FEATURES: readonly string[] = PASS_FEATURES.filter(
  (f) => f.inQuotaModal
).map((f) => f.title);

export type PassFeatureId = (typeof PASS_FEATURES)[number]['id'];

// 딥링크 값(/pass?feature=…)은 아는 id일 때만 쓴다
export const toPassFeatureId = (value: string | string[] | undefined): PassFeatureId | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return PASS_FEATURES.find((f) => f.id === raw)?.id ?? null;
};

// 갤러리에서 처음 보여 줄 장. 모르면 첫 장
export const passFeatureIndex = (id: PassFeatureId | null): number =>
  Math.max(
    PASS_FEATURES.findIndex((f) => f.id === id),
    0
  );
