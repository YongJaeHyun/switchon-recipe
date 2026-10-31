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
