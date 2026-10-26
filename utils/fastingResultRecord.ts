import type { FastingResult, FastingResultRecord } from 'api/FastingResultAPI';

// 1분 이상만 단식한 분으로 본다 (0분은 "0분"으로 보이지 않게 시간 없음)
const minutesOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : null;

// DB 행 → 결과 + 단식한 분. 성공이면 분은 없는 것으로 본다
export function fastingResultRecord(row: {
  result: string;
  fasted_minutes?: number | null;
}): FastingResultRecord {
  const result = row.result as FastingResult;
  return { result, fastedMinutes: result === 'broken' ? minutesOf(row.fasted_minutes) : null };
}

// 저장할 행. 성공이면 단식한 분을 지운다 (일찍 끝냄 → 성공으로 바꿀 때 남지 않게)
export function fastingResultUpsertRow({
  uid,
  day,
  result,
  fastedMinutes,
  now,
}: {
  uid: string;
  day: string;
  result: FastingResult;
  fastedMinutes?: number | null;
  now: Date;
}) {
  return {
    uid,
    day,
    result,
    fasted_minutes: result === 'broken' ? (fastedMinutes ?? null) : null,
    updated_at: now.toISOString(),
  };
}
