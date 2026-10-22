// cron 배치(service role 전용)가 쓰는 "오늘" KST 날짜. 테스트용으로 ?today=yyyy-MM-dd 지정을 허용한다
// (호출부가 service role 확인을 먼저 끝낸 뒤에만 읽는다).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import를 두지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const kstToday = (now: Date): string =>
  new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// KST 날짜 dayOffset일 뒤 00:00 KST의 UTC ISO 시각 (DB timestamptz 비교용)
export const kstMidnightIso = (day: string, dayOffset = 0): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + dayOffset * DAY_MS - KST_OFFSET_MS).toISOString();

const isValidDay = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

// ?today= 없으면 현재 KST 날짜, 잘못된 값이면 null
export const resolveToday = (req: Request, now: Date): string | null => {
  const param = new URL(req.url).searchParams.get('today');
  if (param === null) return kstToday(now);
  return isValidDay(param) ? param : null;
};
