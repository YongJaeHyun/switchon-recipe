// 인바디 결과지 읽기(read-inbody 엣지 함수) 응답 해석과 체중 시트 칸 채우기 (순수 함수)
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
  | { found: true; texts: InbodyFieldTexts; measuredDay: string | null };

const fill = (value: number | null, current: string) =>
  value != null ? value.toFixed(1) : current;

// 읽은 값을 칸에 채운다. 못 읽은 칸은 사용자가 적어 둔 값을 남긴다. 숫자가 하나도 없으면 찾지 못함
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
  };
}

// yyyy-MM-dd → "M/D"
export const formatMonthDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};
