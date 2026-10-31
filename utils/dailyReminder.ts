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

// 내일(KST)이 1주차 1~7일 또는 2주차 1일이면 내일 09:00 KST 알림 하나, 아니면 null.
// 앱을 열 때마다 이것으로 바꿔 걸어, 그날 앱을 안 연 사람에게만 간다 (기기 시간대와 상관없음).
// 시작 전날 앱을 연 사람(내일부터 시작)도 시작일 아침에 받는다.
// weightReminderOn = 체중 기록 알림(user_setting.weight_reminder, 09:00 KST 서버 푸시) 켜짐 여부.
// 켜져 있으면 같은 시각 배너 두 개가 되지 않게 걸지 않는다 (체중 푸시가 앱으로 불러온다).
// 아직 모르면(undefined: 설정을 불러오는 중·실패) 겹칠 수 있으니 걸지 않는다 — 불러오면 다시 맞춘다
export function nextMorningReminder({
  startDate,
  weightReminderOn,
  now,
}: {
  startDate: string | null | undefined;
  weightReminderOn: boolean | undefined;
  now: Date;
}): DailyReminder | null {
  if (weightReminderOn !== false) return null;
  if (!startDate) return null;
  const tomorrow = addDaysToDay(kstDay(now), 1);
  const { week, day, beforeStart } = programWeekAndDay(startDate, tomorrow);
  if (beforeStart) return null;
  if (week !== 1 && !(week === 2 && day === 1)) return null;

  const [y, m, d] = tomorrow.split('-').map(Number);
  const midnight = Date.UTC(y, m - 1, d) - KST_OFFSET_MS; // 내일 KST 자정
  return {
    date: new Date(midnight + DAILY_REMINDER_MINUTES * MINUTE_MS),
    title: `${week}주차 ${day}일차`,
    // 주차 첫날은 "N주차가", 그 밖은 "N일차가"
    body: `${day === 1 ? `${week}주차` : `${day}일차`}가 시작됐어요. 오늘 할 일을 확인해 보세요`,
  };
}

// 1주차(1~7일)에 오늘 할 일이 방금 100%가 됐고(prevRate < 100) 오늘(KST) 아직 축하를 안 봤으면 true.
// prevRate = 같은 날 바로 전에 읽은 완료율, 처음 읽는 값이면 null → 아님 (앱을 열 때 이미 100%거나,
// 자정에 초기화 전 어제 100%가 잠깐 남아 있을 때 축하하지 않게).
// 보여줄 때 markCelebratedDay로 celebrationKey(오늘, 시작일)를 남겨, 체크를 풀었다 다시 100%가 돼도 하루 한 번만.
// 시작일까지 키에 넣어, 축하를 본 날 처음부터 다시 시작하면(할 일이 초기화됨) 새 1일차를 끝냈을 때 다시 축하한다
export function shouldCelebrate({
  week,
  day,
  completedRate,
  prevRate,
  celebratedDays,
  today,
  startDate,
}: {
  week: number;
  day: number;
  completedRate: number;
  prevRate: number | null;
  celebratedDays: string[];
  today: string;
  startDate?: string | null;
}): boolean {
  if (week !== 1 || day < 1 || day > 7) return false;
  if (completedRate !== 100) return false;
  if (prevRate === null || prevRate >= 100) return false;
  return !celebratedDays.includes(celebrationKey(today, startDate));
}

// 완주 축하 기록 키: "오늘@시작일" (시작일이 없으면 오늘만). 업데이트 전 기록(날짜만)과는 겹치지 않아,
// 업데이트한 날 이미 본 축하를 한 번 더 볼 수 있다 (그날 하루뿐)
export function celebrationKey(today: string, startDate?: string | null): string {
  return startDate ? `${today}@${startDate.slice(0, 10)}` : today;
}

export function markCelebratedDay(celebratedDays: string[], day: string): string[] {
  if (celebratedDays.includes(day)) return celebratedDays;
  return [...celebratedDays, day].slice(-CELEBRATED_DAYS_KEEP);
}

// useUserSetting의 setting(user_setting 캐시) → nextMorningReminder의 weightReminderOn.
// undefined = 아직 안 불러옴(모름), null = 행 없음 → 기본값 꺼짐 (DB default false)
export function weightReminderOnFrom(
  setting: { weight_reminder: boolean } | null | undefined
): boolean | undefined {
  if (setting === undefined) return undefined;
  return setting?.weight_reminder ?? false;
}
