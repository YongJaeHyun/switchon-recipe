import { WEEK1_DAILY_GUIDE, type Week1DayGuide } from 'const/week1Guide';

// 오늘(주차·일차)의 1주차 일별 안내. 1주차 1~7일만, 그 밖(시작 전 일차 0·2주차 이후)은 null
export function week1GuideFor(week: number, day: number): Week1DayGuide | null {
  if (week !== 1 || !Number.isInteger(day) || day < 1 || day > 7) return null;
  return WEEK1_DAILY_GUIDE[day] ?? null;
}

// 안내 카드를 오늘(KST yyyy-MM-dd) 닫았는지. 닫으면 그날만 숨긴다
export function isWeek1GuideDismissed(dismissedDay: string | null, todayKst: string): boolean {
  return dismissedDay === todayKst;
}
