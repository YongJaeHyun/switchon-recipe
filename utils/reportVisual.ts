// 주간 리포트 화면의 그래프·점·막대용 순수 함수. 앱에서 받은 그 주 기록(할 일·체중·단식)으로 그린다.
// 기록을 못 받았거나 지난 프로그램이라 없으면 리포트에 저장된 숫자(stats)로 물러선다
import type { WeeklyStats } from 'types/report';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface DayRange {
  from: string;
  to: string;
}

const dayToUtc = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const utcToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const inRange = (day: string, range: DayRange) => day >= range.from && day <= range.to;
const byDay = <T extends { day: string }>(a: T, b: T) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : 0;

// 서버 weeklyStats.ts round1과 같은 반올림 (소수 한 자리)
const round1 = (n: number) => Math.round(Number((n * 10).toFixed(6))) / 10;

// 기간의 날짜와 요일 한 글자 (오래된 날 → 마지막 날)
export function rangeDays(range: DayRange): { day: string; weekday: string }[] {
  const days: { day: string; weekday: string }[] = [];
  for (let t = dayToUtc(range.from); t <= dayToUtc(range.to); t += DAY_MS) {
    days.push({ day: utcToDay(t), weekday: WEEKDAYS[new Date(t).getUTCDay()] });
  }
  return days;
}

export interface TodoBar {
  day: string;
  weekday: string;
  rate: number | null; // 0~100, 그날 기록이 없으면 null
  height: number; // 0~1 막대 높이
  isBest: boolean; // 가장 잘한 날 (동률이면 앞선 날, 모두 0%면 없음)
}

// 요일별 할 일 완료 막대. 서버 todoStats와 같은 계산 (항목 범위 밖·중복 체크 번호는 세지 않는다).
// 그 주 기록이 하나도 없으면 null (그래프를 숨긴다)
export function dailyTodoBars(
  range: DayRange,
  todoDays: { day: string; items: string[]; checked: number[] }[]
): TodoBar[] | null {
  const rateByDay = new Map<string, number>();
  for (const d of todoDays) {
    const day = d.day.slice(0, 10);
    if (!inRange(day, range) || d.items.length === 0) continue;
    const checked = new Set(
      d.checked.filter((i) => Number.isInteger(i) && i >= 0 && i < d.items.length)
    );
    rateByDay.set(day, checked.size / d.items.length);
  }
  if (rateByDay.size === 0) return null;

  const bars = rangeDays(range).map(({ day, weekday }) => {
    const ratio = rateByDay.get(day);
    return {
      day,
      weekday,
      ratio: ratio ?? null,
      rate: ratio === undefined ? null : Math.round(ratio * 100),
      height: ratio ?? 0,
    };
  });
  const best = bars.reduce<(typeof bars)[number] | null>(
    (a, b) => (b.ratio !== null && b.ratio > 0 && (!a || b.ratio > (a.ratio ?? 0)) ? b : a),
    null
  );
  return bars.map(({ ratio: _ratio, ...bar }) => ({ ...bar, isBest: bar.day === best?.day }));
}

// 그 주 체중 꺾은선 점 (날짜순). 2개 미만이면 선을 그릴 수 없어 빈 배열
export function weekWeightPoints(
  range: DayRange,
  logs: { day: string; weight_kg: number }[]
): { day: string; label: string; value: number }[] {
  const points = logs
    .filter((log) => inRange(log.day.slice(0, 10), range))
    .sort(byDay)
    .map((log) => {
      const day = log.day.slice(0, 10);
      const [, m, d] = day.split('-').map(Number);
      return { day, label: `${m}/${d}`, value: Number(log.weight_kg) };
    });
  return points.length >= 2 ? points : [];
}

// 그 주 체중 숫자를 지금 기록으로 다시 계산 (서버 weeklyStats.ts weightStats와 같은 규칙).
// baselineStart = 누적 변화 기준일(지금 프로그램 시작일). 빠진 날을 적으면 다시 만들지 않아도 숫자가 바뀐다
export function liveWeekWeight({
  range,
  logs,
  baselineStart,
}: {
  range: DayRange;
  logs: { day: string; weight_kg: number }[];
  baselineStart: string;
}): WeeklyStats['weight'] {
  const sorted = logs.map((w) => ({ ...w, day: w.day.slice(0, 10) })).sort(byDay);
  const week = sorted.filter((w) => inRange(w.day, range));
  if (week.length === 0) {
    return { start: null, end: null, diff: null, daysLogged: 0, totalDiff: null };
  }
  const first = Number(week[0].weight_kg);
  const last = Number(week[week.length - 1].weight_kg);
  const start = baselineStart.slice(0, 10);
  const baseline = sorted.find((w) => w.day >= start && w.day <= range.to);
  return {
    start: first,
    end: last,
    diff: week.length >= 2 ? round1(last - first) : null,
    daysLogged: week.length,
    totalDiff: baseline ? round1(last - Number(baseline.weight_kg)) : null,
  };
}

export interface ItemProgress {
  name: string;
  done: number;
  appeared: number;
  ratio: number; // 0~1
  percent: number; // 0~100 정수
}

// 항목별 완료 막대 (리포트 stats.todo.items 순서 그대로)
export function itemProgress(
  items: { name: string; done: number; appeared: number }[]
): ItemProgress[] {
  return items.map((item) => {
    const ratio = item.appeared > 0 ? Math.min(1, item.done / item.appeared) : 0;
    return { ...item, ratio, percent: Math.round(ratio * 100) };
  });
}

// success 성공 / early 일찍 끝냄 / missed 결과 없이 응답 기간이 지남 / pending 진행 중·응답 대기
export type FastingDotKind = 'success' | 'early' | 'missed' | 'pending';

export interface FastingDot {
  day: string;
  weekday: string;
  kind: FastingDotKind;
}

// 결과를 물을 수 있는 기간 끝: 단식 시작(그날 KST, 시작 시각은 늦어도 그날 안) + 72시간 → 넉넉히 사흘 뒤 날 끝
const answerDeadline = (day: string) => dayToUtc(day) - KST_OFFSET_MS + 4 * DAY_MS;

// 단식 요일 점. items = 기록 탭과 같은 단식 기록(useFastingHistory), 못 받았으면 null.
// 그 주 기록이 없으면 리포트 숫자(성공한 요일·일찍 끝낸 요일)로 그린다 (결과 없는 날은 요일을 몰라 뺀다)
export function fastingDots({
  range,
  items,
  fasting,
  now,
}: {
  range: DayRange;
  items: { day: string; result: 'success' | 'broken' | null; inProgress: boolean }[] | null;
  fasting: WeeklyStats['fasting'];
  now: Date;
}): FastingDot[] {
  const days = rangeDays(range);
  const weekdayOf = new Map(days.map((d) => [d.day, d.weekday]));
  const live = (items ?? []).filter((item) => weekdayOf.has(item.day.slice(0, 10)));

  if (live.length > 0) {
    return live
      .map((item) => {
        const day = item.day.slice(0, 10);
        const kind: FastingDotKind =
          item.result === 'success'
            ? 'success'
            : item.result === 'broken'
              ? 'early'
              : item.inProgress || now.getTime() < answerDeadline(day)
                ? 'pending'
                : 'missed';
        return { day, weekday: weekdayOf.get(day) ?? '', kind };
      })
      .sort(byDay);
  }

  // 리포트 숫자: "월요일" → 그 주의 월요일
  const dayOfWeekday = (name: string) => days.find((d) => d.weekday === name.slice(0, 1));
  const fromStats = (names: string[], kind: FastingDotKind) =>
    names
      .map(dayOfWeekday)
      .filter((d): d is { day: string; weekday: string } => !!d)
      .map((d) => ({ ...d, kind }));
  return [
    ...fromStats(fasting.successWeekdays, 'success'),
    ...fromStats(
      (fasting.earlyEnded ?? []).map((e) => e.weekday),
      'early'
    ),
  ].sort(byDay);
}

// 체중 안내 카드 상태. 패스가 있고 지금 프로그램 리포트일 때만.
// added(B): 지금 기록 일수가 리포트 때(storedDaysLogged)보다 많고 서버가 다시 만들기를 허락 → 카드에서 [글 다시 받기]
// missing(A): 지금 기록이 그 주 7일이 안 되고, 체중 시트가 고를 수 있는 날(allowedRange: weightDateRange) 중
//   빠진 날이 있음 → [체중 적으러 가기] (targetDay = 첫 빠진 날)
// 그 밖은 null (숨김)
export type WeightHintState =
  | { kind: 'missing'; daysLogged: number; targetDay: string }
  | { kind: 'added'; before: number; after: number };

export function weightHintState({
  range,
  logs,
  storedDaysLogged,
  canRegenerate,
  hasAccess,
  isCurrentProgram,
  allowedRange,
}: {
  range: DayRange;
  logs: { day: string }[];
  storedDaysLogged: number;
  canRegenerate: boolean;
  hasAccess: boolean;
  isCurrentProgram: boolean;
  allowedRange: DayRange;
}): WeightHintState | null {
  if (!hasAccess || !isCurrentProgram) return null;
  const logged = new Set(logs.map((log) => log.day.slice(0, 10)));
  const days = rangeDays(range);
  const count = days.filter((d) => logged.has(d.day)).length;
  if (canRegenerate && count > storedDaysLogged) {
    return { kind: 'added', before: storedDaysLogged, after: count };
  }
  if (count >= days.length) return null;
  const target = days.find((d) => !logged.has(d.day) && inRange(d.day, allowedRange));
  return target ? { kind: 'missing', daysLogged: count, targetDay: target.day } : null;
}
