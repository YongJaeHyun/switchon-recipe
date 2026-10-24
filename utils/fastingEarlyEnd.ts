import type { FastingResult } from 'api/FastingResultAPI';

const MINUTE_MS = 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * MINUTE_MS;
const MAX_MINUTES = 24 * 60;

// 끝난 뒤 "일찍 끝냈어요"를 고를 때 몇 시간 몇 분 했는지 고르는 휠 (시 0~23 × 분 00~50, 10분 단위).
// 0시간 0분은 저장할 수 없다 (min)
export const EARLY_END_WHEEL = { maxHour: 23, minuteStep: 10, initial: 960, min: 10 } as const;
const WHEEL_MAX = EARLY_END_WHEEL.maxHour * 60 + 60 - EARLY_END_WHEEL.minuteStep;

// 단식 시작부터 now까지 단식한 분 (분 내림, 1~1440). 1분이 안 돼도 "0분"이 아니라 1분
export function fastedMinutesAt(startsAt: Date, now: Date): number {
  const minutes = Math.floor((now.getTime() - startsAt.getTime()) / MINUTE_MS);
  return Math.min(MAX_MINUTES, Math.max(1, minutes));
}

// 990 → "16시간 30분", 960 → "16시간", 45 → "45분", null → ""
export function formatFastedHours(minutes: number | null): string {
  if (minutes === null) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

// 단식 결과의 day = 단식 시작일 (KST 날짜)
export function fastingDayOf(startsAt: Date): string {
  return new Date(startsAt.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 휠 시작 값(분): 저장된 분이 있으면 10분 단위로 내려 10분~23시간 50분 안에, 없으면 16시간
export function minutesForWheel(minutes: number | null): number {
  if (minutes === null) return EARLY_END_WHEEL.initial;
  const step = EARLY_END_WHEEL.minuteStep;
  return Math.min(WHEEL_MAX, Math.max(EARLY_END_WHEEL.min, Math.floor(minutes / step) * step));
}

export function canSaveFastedMinutes(minutes: number): boolean {
  return minutes >= EARLY_END_WHEEL.min;
}

export function earlyEndConfirmMessage(minutes: number): string {
  return `지금까지 ${formatFastedHours(minutes)} 동안 단식했어요. 여기서 끝낼까요?`;
}

// 오늘 탭 결과 줄 문구
export function fastingResultLabel(result: FastingResult, fastedMinutes: number | null): string {
  if (result === 'success') return '성공으로 기록했어요';
  return fastedMinutes === null
    ? '일찍 끝냈다고 기록했어요'
    : `${formatFastedHours(fastedMinutes)} 하고 끝냈다고 기록했어요`;
}

// 기록 탭 목록 문구
export function fastingHistoryLabel(
  result: FastingResult | null,
  fastedMinutes: number | null
): string {
  if (result === null) return '기록 안 함';
  if (result === 'success') return '성공';
  return fastedMinutes === null ? '일찍 끝냄' : `${formatFastedHours(fastedMinutes)} (일찍 끝냄)`;
}
