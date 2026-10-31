import { addDaysToDay, programStartOf, programWeekAndDay } from './programStart';
import { round1 } from './weight';

// 2·3주차가 끝나 다음 주차로 넘어갈 때 "한 주 더 하기"를 제안할지 (근거·문구는 const/weekRepeat.ts).
// 날짜는 모두 yyyy-MM-dd (KST). 문자열 비교로 날짜 순서를 본다

export type WeekRepeatAdvice =
  | { kind: 'none' }
  | { kind: 'noData'; repeatWeek: number }
  | {
      kind: 'suggestRepeat' | 'onTrack';
      repeatWeek: number;
      muscleDiff: number;
      fatDiff: number | null; // 기준·최근 둘 다 체지방이 있을 때만
    };

export interface BodyCompLog {
  day: string;
  muscle_kg?: number | null;
  fat_kg?: number | null;
}

type MuscleLog = { day: string; muscle_kg: number; fat_kg: number | null };

// 기준값 구간: 회차 시작 7일 전 ~ 회차 시작 2일 뒤 (회차 시작 무렵 잰 인바디).
// 회차 시작일(programStartOf)은 한 주 더 하기로 start_date가 미뤄져도 그대로다 (기준값이 따라 움직이지 않게)
const BASELINE_BEFORE_DAYS = 7;
const BASELINE_AFTER_DAYS = 2;

export function weekRepeatAdvice({
  logs,
  startDate,
  programStart,
  enteringWeek,
}: {
  logs: BodyCompLog[];
  startDate: string | null | undefined;
  programStart?: string | null; // user.program_start. 없으면 start_date가 회차 시작
  enteringWeek: number;
}): WeekRepeatAdvice {
  if (!startDate || (enteringWeek !== 3 && enteringWeek !== 4)) return { kind: 'none' };
  const repeatWeek = enteringWeek - 1;
  const start = startDate.slice(0, 10);
  // 지난 주(repeatWeek)의 마지막 날
  const lastWeekEnd = addDaysToDay(start, 7 * repeatWeek - 1);

  // 골격근이 있는 기록만 인바디 기록으로 친다 (날짜순)
  const muscleLogs: MuscleLog[] = logs
    .filter((l): l is BodyCompLog & { muscle_kg: number } => l.muscle_kg != null)
    .map((l) => ({ day: l.day.slice(0, 10), muscle_kg: l.muscle_kg, fat_kg: l.fat_kg ?? null }))
    .filter((l) => l.day <= lastWeekEnd)
    .sort((a, b) => a.day.localeCompare(b.day));

  const program = programStartOf(programStart, start) ?? start;
  const windowFrom = addDaysToDay(program, -BASELINE_BEFORE_DAYS);
  const windowTo = addDaysToDay(program, BASELINE_AFTER_DAYS);
  const inWindow = muscleLogs.filter((l) => l.day >= windowFrom && l.day <= windowTo);
  const baseline = inWindow.at(-1) ?? muscleLogs.find((l) => l.day >= program);
  // 지난 주 마지막 기록, 없으면 그 전 주까지의 마지막 기록. 기준값과 같은 날(같은 기록)이면 비교할 수 없다
  const latest = muscleLogs.at(-1);

  if (!baseline || !latest || latest.day <= baseline.day) return { kind: 'noData', repeatWeek };

  const muscleDiff = round1(latest.muscle_kg - baseline.muscle_kg);
  const fatDiff =
    latest.fat_kg != null && baseline.fat_kg != null
      ? round1(latest.fat_kg - baseline.fat_kg)
      : null;

  // p011: 3주차까지 골격근 유지·증가 + 체지방 감소일 때만 4주차로. 2주차 끝은 골격근만 본다
  const repeat = muscleDiff < 0 || (repeatWeek === 3 && fatDiff != null && fatDiff >= 0);
  return { kind: repeat ? 'suggestRepeat' : 'onTrack', repeatWeek, muscleDiff, fatDiff };
}

// 같은 전환(시작일 + 진입 주차)에서는 한 번만 묻는다. 한 주 더 해서 시작일이 바뀌면 새 전환이다
export function weekRepeatKey(startDate: string, enteringWeek: number): string {
  return `${startDate.slice(0, 10)}:${enteringWeek}`;
}

// 주차 맞추기·온보딩으로 오늘이 3·4주차가 되게 시작일을 정했다면, 지금 들어선 전환은 사용자가 스스로 정한 것이라
// 한 주 더 하기를 묻지 않도록 미리 '물어봄'으로 남길 키. 그 외(1·2주차, 유지기, 시작 전)는 null
export function declaredWeekRepeatKey(
  startDate: string | null | undefined,
  todayKst: string
): string | null {
  if (!startDate) return null;
  const { week, beforeStart } = programWeekAndDay(startDate, todayKst);
  if (beforeStart || (week !== 3 && week !== 4)) return null;
  return weekRepeatKey(startDate, week);
}

export function shouldAskWeekRepeat({
  startDate,
  week,
  askedKeys,
}: {
  startDate: string | null | undefined;
  week: number;
  askedKeys: string[];
}): boolean {
  if (!startDate || (week !== 3 && week !== 4)) return false;
  return !askedKeys.includes(weekRepeatKey(startDate, week));
}

const MAX_ASKED_KEYS = 20;

// 물은 키 더하기 (중복 없음, 최근 MAX_ASKED_KEYS개만 남김)
export function addWeekRepeatAskedKey(keys: string[], key: string): string[] {
  if (keys.includes(key)) return keys;
  return [...keys, key].slice(-MAX_ASKED_KEYS);
}
