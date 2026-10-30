// 인바디 결과지 읽기(read-inbody 엣지 함수) 응답 해석과 체중 시트 칸 채우기 (순수 함수)
import type { BodyComp } from './bodyComp';
import { IMAGE_TOO_LARGE_MESSAGE } from './foodCheckInput';

// read-inbody가 돌려주는 값. 읽지 못한 값은 null
export interface InbodyReadResult {
  weight_kg: number | null;
  muscle_kg: number | null;
  fat_kg: number | null;
  measured_on: string | null; // yyyy-MM-dd
}

export type InbodyReadOutcome =
  | { status: 'ok'; result: InbodyReadResult }
  // 402: 패스가 없거나 만료됨 (스위치온 패스 전용 기능)
  | { status: 'locked' }
  | { status: 'quotaExceeded' | 'tooLarge' | 'invalid' | 'error'; message: string };

// 체중 시트 입력칸 문자열
export interface InbodyFieldTexts {
  weight: string;
  muscle: string;
  fat: string;
}

export const INBODY_NOT_FOUND_MESSAGE = '결과지에서 숫자를 찾지 못했어요. 직접 입력해 주세요';
// supabase/functions/read-inbody/handler.ts INBODY_QUOTA_EXCEEDED_MESSAGE와 같다
const QUOTA_EXCEEDED_MESSAGE = '오늘 결과지 읽기를 모두 사용했어요 · 자정에 다시 채워져요';
const ERROR_MESSAGE = '결과지를 읽지 못했어요. 잠시 후 다시 시도해 주세요';
const INVALID_FALLBACK = '사진을 확인해 주세요';

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const isNumOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

const toResult = (value: unknown): InbodyReadResult | null => {
  const v = asObject(value);
  if (
    !v ||
    !isNumOrNull(v.weight_kg) ||
    !isNumOrNull(v.muscle_kg) ||
    !isNumOrNull(v.fat_kg) ||
    !(v.measured_on === null || typeof v.measured_on === 'string')
  ) {
    return null;
  }
  return {
    weight_kg: v.weight_kg as number | null,
    muscle_kg: v.muscle_kg as number | null,
    fat_kg: v.fat_kg as number | null,
    measured_on: v.measured_on as string | null,
  };
};

export function interpretInbodyResponse(status: number, body: unknown): InbodyReadOutcome {
  const b = asObject(body);
  if (status === 200) {
    const result = b?.status === 'ok' ? toResult(b.result) : null;
    return result ? { status: 'ok', result } : { status: 'error', message: ERROR_MESSAGE };
  }
  if (status === 402) return { status: 'locked' };
  if (status === 429) return { status: 'quotaExceeded', message: QUOTA_EXCEEDED_MESSAGE };
  if (status === 413) return { status: 'tooLarge', message: IMAGE_TOO_LARGE_MESSAGE };
  if (status === 400) {
    return {
      status: 'invalid',
      message: typeof b?.error === 'string' && b.error ? b.error : INVALID_FALLBACK,
    };
  }
  return { status: 'error', message: ERROR_MESSAGE };
}

export type InbodyFill =
  | { found: false }
  // measuredDay: 결과지 날짜가 저장할 날(targetDay)과 다르고 오늘 이전이면 그 날짜, 아니면 null
  // measuredDayOld: 결과지 날짜가 오늘보다 OLD_MEASURED_DAYS일 넘게 지났다 (기본 선택을 오늘로)
  | { found: true; texts: InbodyFieldTexts; measuredDay: string | null; measuredDayOld: boolean };

// 결과지 날짜가 이보다 오래되면 기본 저장 날을 결과지 날짜 대신 시트 날짜로 한다 (앨범의 오래된 사진)
export const OLD_MEASURED_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const fill = (value: number | null, current: string) =>
  value != null ? value.toFixed(1) : current;

// 읽은 값을 칸에 채운다 (시트 날짜로 저장할 때). 못 읽은 칸은 사용자가 적어 둔 값을 남긴다.
// 숫자가 하나도 없으면 찾지 못함. 결과지 날짜로 저장할 때의 칸은 inbodyTextsForDay로 다시 만든다
export function inbodyFill({
  result,
  texts,
  targetDay,
  today,
}: {
  result: InbodyReadResult;
  texts: InbodyFieldTexts;
  targetDay: string;
  today: string;
}): InbodyFill {
  const { weight_kg, muscle_kg, fat_kg, measured_on } = result;
  if (weight_kg == null && muscle_kg == null && fat_kg == null) return { found: false };
  const measuredDay =
    measured_on && measured_on !== targetDay && measured_on <= today ? measured_on : null;
  return {
    found: true,
    texts: {
      weight: fill(weight_kg, texts.weight),
      muscle: fill(muscle_kg, texts.muscle),
      fat: fill(fat_kg, texts.fat),
    },
    measuredDay,
    measuredDayOld: measuredDay !== null && daysBetween(measuredDay, today) > OLD_MEASURED_DAYS,
  };
}

const toText = (value: number | null | undefined) => (value != null ? value.toFixed(1) : '');

// 그날 기록 값만 칸 문자열로 (전날 체중을 끌어오는 prefillWeight와 달리 그날 것만). 없으면 빈칸
export function dayLogTexts(
  logs: ({ day: string; weight_kg: number } & Partial<BodyComp>)[],
  day: string
): InbodyFieldTexts {
  const log = logs.find((l) => l.day === day);
  return {
    weight: toText(log?.weight_kg),
    muscle: toText(log?.muscle_kg),
    fat: toText(log?.fat_kg),
  };
}

// 결과지 날짜로 저장할 때 칸: 읽은 값 + 못 읽은 칸은 그 저장 날의 기존 값(base, 없으면 빈칸).
// 다른 날(시트를 연 날) 값이 결과지 날짜 기록에 섞이지 않게 한다.
// weightMissing: 체중을 못 읽었고 그날 체중 기록도 없다 (체중은 필수라 직접 적어야 저장할 수 있다)
export function inbodyTextsForDay({
  result,
  base,
}: {
  result: InbodyReadResult;
  base: InbodyFieldTexts;
}): { texts: InbodyFieldTexts; weightMissing: boolean } {
  return {
    texts: {
      weight: fill(result.weight_kg, base.weight),
      muscle: fill(result.muscle_kg, base.muscle),
      fat: fill(result.fat_kg, base.fat),
    },
    weightMissing: result.weight_kg == null && base.weight === '',
  };
}

// yyyy-MM-dd → "M/D"
export const formatMonthDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};

// 결과지 날짜 표시: 올해(todayKst의 해)면 M/D, 다른 해면 YYYY.MM.DD (앨범의 몇 년 전 결과지)
export const formatReadDay = (day: string, todayKst: string) => {
  if (day.slice(0, 4) === todayKst.slice(0, 4)) return formatMonthDay(day);
  return day.slice(0, 10).replace(/-/g, '.');
};
