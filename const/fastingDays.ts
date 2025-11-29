// 단식 요일
export type FastingDay = (typeof FASTING_DAYS)[number];

export const FASTING_DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 단식 시작 시간
export type FastingTime = (typeof FASTING_START_TIMES)[number];

export const FASTING_START_TIMES = ['아침 식후', '점심 식후', '저녁 식후'] as const;
