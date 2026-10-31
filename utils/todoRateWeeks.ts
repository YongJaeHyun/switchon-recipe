import type { Nullable } from 'types/common';
import type { TodoRateStatistic } from 'types/statistics';

// 기록 탭 4주 리포트의 일별 할 일 완료율. 오늘(주차·일차)까지 지난 날만 값, 아직 안 온 날은 null

export interface ProgramProgress {
  week: number;
  day: number;
  beforeStart: boolean;
}

// 그 주차·일차가 오늘까지 지난 날인지. 시작 전이면 어떤 날도 지나지 않았다
export function isDayReached(week: number, day: number, progress: ProgramProgress): boolean {
  if (progress.beforeStart) return false;
  return week < progress.week || (week === progress.week && day <= progress.day);
}

export function buildTodoRateWeeks(
  rows: { week: number | null; day: number | null; todo_rate: number }[],
  progress: ProgramProgress
): TodoRateStatistic[] {
  const rateByDay = new Map<string, number>();
  rows.forEach((row) => rateByDay.set(`${row.week}-${row.day}`, row.todo_rate));

  const weeks: TodoRateStatistic[] = [];
  for (let week = 1; week <= 4; week++) {
    const todoRatesByWeek: Nullable<number>[] = [];
    for (let day = 1; day <= 7; day++) {
      todoRatesByWeek.push(
        isDayReached(week, day, progress) ? (rateByDay.get(`${week}-${day}`) ?? 0) : null
      );
    }
    const reached = todoRatesByWeek.filter((rate): rate is number => typeof rate === 'number');
    const average =
      reached.length > 0
        ? Math.round(reached.reduce((acc, cur) => acc + cur, 0) / reached.length)
        : 0;
    weeks.push({ todoRatesByWeek, average });
  }
  return weeks;
}

// 주차 맞추기 뒤 할 일 통계 행 옮기기. 행의 (주차, 일차)는 저장할 때 시작일 기준이라, 시작일이 deltaDays일 앞당겨지면(양수)
// 같은 날짜가 새 시작일로는 deltaDays일 뒤 칸이다 (미루면 음수). 새 시작일 전으로 가는 행과, 오늘 칸(cut = 새 시작일 기준
// 오늘 주차·일차)부터의 행은 뺀다 (오늘부터는 새로 쌓는다). 주차·일차가 없는 행도 뺀다
export function shiftStatistics<T extends { week: number | null; day: number | null }>(
  rows: T[],
  deltaDays: number,
  cut: { week: number; day: number }
): (Omit<T, 'week' | 'day'> & { week: number; day: number })[] {
  const cutIndex = (cut.week - 1) * 7 + (cut.day - 1);
  return rows.flatMap((row) => {
    if (row.week === null || row.day === null) return [];
    const index = (row.week - 1) * 7 + (row.day - 1) + deltaDays;
    if (index < 0 || index >= cutIndex) return [];
    return [{ ...row, week: Math.floor(index / 7) + 1, day: (index % 7) + 1 }];
  });
}
