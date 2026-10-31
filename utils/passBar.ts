import { passJourney } from './passJourney';

const DAY_MS = 24 * 60 * 60 * 1000;

const ymdToUtc = (value: string) => Date.parse(`${value.slice(0, 10)}T00:00:00Z`);

export interface PassBar {
  totalDays: number; // 막대 전체 = 지금 패스 남은 날 + 고른 기간
  currentDays: number; // 오늘 → 지금 패스 끝 (패스가 없으면 0)
  currentEndsOn: string | null; // 지금 패스가 끝나는 날 ("12월 5일"), 패스가 없으면 null
  endsOn: string; // 고른 기간까지 더하면 끝나는 날
  // 프로그램 주차별 칸. 칸마다 앞쪽 current일은 지금 패스, 뒤쪽 extension일은 연장(새로 사는) 분
  weeks: { week: number; current: number; extension: number }[];
}

// 결제 화면 일정 막대: 언제나 오늘부터, 지금 패스 → 연장분 순서로 주차를 나눈다.
// today·passEnd는 KST 'yyyy-MM-dd'. passEnd가 오늘보다 앞이면 패스가 없는 것으로 본다
export function passBar({
  startDate,
  today,
  passEnd,
  days,
}: {
  startDate: string | null;
  today: string;
  passEnd: string | null;
  days: number;
}): PassBar {
  const remaining = passEnd ? Math.round((ymdToUtc(passEnd) - ymdToUtc(today)) / DAY_MS) : NaN;
  const holder = Number.isFinite(remaining) && remaining >= 0;
  const currentDays = holder ? remaining : 0;
  const totalDays = currentDays + days;

  const { endsOn, segments } = passJourney({ startDate, from: today, days: totalDays });

  let left = currentDays;
  const weeks = segments.map(({ week, days: weekDays }) => {
    const current = Math.min(left, weekDays);
    left -= current;
    return { week, current, extension: weekDays - current };
  });

  const currentEndsOn =
    holder && passEnd ? `${Number(passEnd.slice(5, 7))}월 ${Number(passEnd.slice(8, 10))}일` : null;

  return { totalDays, currentDays, currentEndsOn, endsOn, weeks };
}
