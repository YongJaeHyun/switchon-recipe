export const CHANNELS = {
  INQUIRY: 'INQUIRY',
  FASTING: 'FASTING',
  INGREDIENT: 'INGREDIENT',
  // 주간 리포트·체중 기록 알림 (서버 푸시)
  REPORT: 'REPORT',
  // 1주차 끼니 시간 알림 (로컬)
  MEAL: 'MEAL',
  // 1주차 다음 날 아침 리마인드 (로컬)
  DAILY: 'DAILY',
  // 요리 모드·조리 순서 타이머 (로컬)
  COOKING: 'COOKING',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
