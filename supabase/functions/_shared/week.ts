// 프로그램 주차 계산 (앱 utils/date.ts getWeekAndDay와 같은 규칙).
// 오늘(KST 날짜) - 시작일(날짜) 경과 일수로 주차를 구한다. 하루 경계는 KST 자정.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Date를 KST 달력 날짜의 UTC 자정 타임스탬프로 바꾼다 (날짜끼리 일수 차이를 구하기 위함)
const kstDayStart = (date: Date) => {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
};

const startDayOf = (startDate: string): number | null => {
  // user.start_date는 date 컬럼("yyyy-MM-dd"). 시각이 붙은 값이면 KST 날짜로 본다.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = new Date(startDate);
  return Number.isNaN(parsed.getTime()) ? null : kstDayStart(parsed);
};

// 시작일이 없거나 해석할 수 없거나 미래면 1주차로 본다 (앱은 미래 시작일에 0 이하가 나올 수 있지만
// 판정 프롬프트는 1주차 이상만 받으므로 여기서 1로 맞춘다).
export function programWeekOf(startDate: string | null | undefined, now: Date): number {
  if (!startDate) return 1;
  const start = startDayOf(startDate);
  if (start === null) return 1;

  const daysDiff = Math.round((kstDayStart(now) - start) / DAY_MS);
  return Math.max(1, Math.floor(daysDiff / 7) + 1);
}
