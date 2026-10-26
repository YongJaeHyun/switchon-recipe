export const CHANNELS = {
  INQUIRY: 'INQUIRY',
  FASTING: 'FASTING',
  INGREDIENT: 'INGREDIENT',
  // 주간 리포트·체중 기록 알림 (서버 푸시)
  REPORT: 'REPORT',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
