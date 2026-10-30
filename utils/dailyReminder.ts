// 1주차 완주 축하·다음 날 아침 리마인드 판정 (순수). 예약·취소는 utils/notifications의 syncDailyReminder
import { addDaysToDay, programWeekAndDay } from './programStart';

const MINUTE_MS = 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * MINUTE_MS;
// 아침 리마인드 시각 (분, KST 09:00)
export const DAILY_REMINDER_MINUTES = 540;
// 축하 본 날은 최근 것만 남긴다 (1주차 7일이면 충분)
const CELEBRATED_DAYS_KEEP = 14;

export interface DailyReminder {
  date: Date;
  title: string;
  body: string;
}

const kstDay = (now: Date) => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 내일(KST)이 1주차 2~7일 또는 2주차 1일이면 내일 09:00 KST 알림 하나, 아니면 null.
// 앱을 열 때마다 이것으로 바꿔 걸어, 그날 앱을 안 연 사람에게만 간다 (기기 시간대와 상관없음)
export function nextMorningReminder({
  startDate,
  now,
}: {
  startDate: string | null | undefined;
  now: Date;
}): DailyReminder | null {
  if (!startDate) return null;
  const tomorrow = addDaysToDay(kstDay(now), 1);
  const { week, day, beforeStart } = programWeekAndDay(startDate, tomorrow);
  if (beforeStart) return null;
  const isWeek1 = week === 1 && day >= 2;
  const isWeek2First = week === 2 && day === 1;
  if (!isWeek1 && !isWeek2First) return null;

  const [y, m, d] = tomorrow.split('-').map(Number);
  const midnight = Date.UTC(y, m - 1, d) - KST_OFFSET_MS; // 내일 KST 자정
  return {
    date: new Date(midnight + DAILY_REMINDER_MINUTES * MINUTE_MS),
    title: `${week}주차 ${day}일차`,
    body: `${isWeek1 ? `${day}일차` : '2주차'}가 시작됐어요. 오늘 할 일을 확인해 보세요`,
  };
}

// 1주차(1~7일)에 오늘 할 일이 방금 100%가 됐고(prevRate < 100) 오늘(KST) 아직 축하를 안 봤으면 true.
// prevRate = 같은 날 바로 전에 읽은 완료율, 처음 읽는 값이면 null → 아님 (앱을 열 때 이미 100%거나,
// 자정에 초기화 전 어제 100%가 잠깐 남아 있을 때 축하하지 않게).
// 보여줄 때 markCelebratedDay로 오늘을 남겨, 체크를 풀었다 다시 100%가 돼도 하루 한 번만
export function shouldCelebrate({
  week,
  day,
  completedRate,
  prevRate,
  celebratedDays,
  today,
}: {
  week: number;
  day: number;
  completedRate: number;
  prevRate: number | null;
  celebratedDays: string[];
  today: string;
}): boolean {
  if (week !== 1 || day < 1 || day > 7) return false;
  if (completedRate !== 100) return false;
  if (prevRate === null || prevRate >= 100) return false;
  return !celebratedDays.includes(today);
}

export function markCelebratedDay(celebratedDays: string[], day: string): string[] {
  if (celebratedDays.includes(day)) return celebratedDays;
  return [...celebratedDays, day].slice(-CELEBRATED_DAYS_KEEP);
}
