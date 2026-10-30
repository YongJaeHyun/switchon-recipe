// 인바디 결과지 읽기: 프롬프트·응답 스키마와 Gemini 응답 정규화 (순수 로직).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export interface InbodyResult {
  weight_kg: number | null;
  muscle_kg: number | null;
  fat_kg: number | null;
  measured_on: string | null; // yyyy-MM-dd
}

export type ParsedInbody = { status: 'ok'; result: InbodyResult } | { status: 'invalid' };

// 앱 입력 범위와 같다 (utils/weight.ts MIN/MAX_WEIGHT_KG, utils/bodyComp.ts BODY_COMP_RANGE,
// 마이그레이션 20261030020000_weight_body_comp.sql의 check). 한쪽을 고치면 함께 고친다
const RANGE = {
  weight_kg: { min: 20, max: 300 },
  muscle_kg: { min: 5, max: 100 },
  fat_kg: { min: 1, max: 200 },
} as const;

export function buildInbodyPrompt(): string {
  return [
    '이 사진이 인바디(InBody) 체성분 검사 결과지이거나 인바디 앱의 검사 결과 화면이면, 이번 검사의 측정값을 읽어 JSON으로만 답하세요.',
    '',
    '- weight_kg: 체중(kg). 결과지 "체성분분석"(또는 "골격근·지방분석")의 체중 측정값.',
    '- muscle_kg: 골격근량(kg). 결과지 "골격근·지방분석"의 골격근량 측정값.',
    '- fat_kg: 체지방량(kg). 결과지 "체성분분석"의 체지방량 측정값. 단위가 kg인 체지방량만 넣으세요. 체지방률(%, PBF)은 체지방량이 아니므로 절대 넣지 마세요.',
    '- measured_on: 검사 날짜(검사일시·측정일)를 yyyy-MM-dd 형식으로. 보이지 않으면 null.',
    '',
    '규칙:',
    '- 숫자는 단위 없이 숫자만 넣으세요 (예: 72.4).',
    '- 표준범위·정상범위·적정체중·목표값·체성분 변화 그래프의 지난 기록은 이번 측정값이 아닙니다. 이번 검사의 측정값만 읽으세요.',
    '- 흐리거나 가려져서 확실하지 않은 값은 추측하지 말고 null로 두세요.',
    '- 인바디 결과지나 인바디 앱 화면이 아니면 네 값을 모두 null로 두세요.',
  ].join('\n');
}

// Gemini generationConfig.responseSchema (OpenAPI 부분집합)
export const INBODY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    weight_kg: { type: 'NUMBER', nullable: true },
    muscle_kg: { type: 'NUMBER', nullable: true },
    fat_kg: { type: 'NUMBER', nullable: true },
    measured_on: { type: 'STRING', nullable: true },
  },
  required: ['weight_kg', 'muscle_kg', 'fat_kg', 'measured_on'],
} as const;

// utils/weight.ts round1과 같다 (30.15 * 10 = 301.4999.. 오차를 피하려고 지수 표기로 자리 이동)
const round1 = (n: number) => Math.round(Number(`${n}e1`)) / 10;

// 숫자 또는 "72.4", "30,1 kg" 같은 문자열 → kg(소수 한 자리). 그 밖이나 범위 밖이면 null
const toKg = (value: unknown, { min, max }: { min: number; max: number }): number | null => {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const s = value
      .trim()
      .replace(/\s*kg$/i, '')
      .replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  const kg = round1(n);
  return Number.isFinite(kg) && kg >= min && kg <= max ? kg : null;
};

// yyyy-MM-dd(구분자 - . /, 한 자리 월일, 뒤에 붙은 시각 허용) → yyyy-MM-dd. 없는 날짜·오늘 이후는 null
const toDay = (value: unknown, today: string): string | null => {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[\sT])/.exec(value.trim());
  if (!m) return null;
  const day = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  return day <= today ? day : null;
};

// Gemini가 돌려준 객체 → 검증한 값. 모양이 어긋난 필드는 그 필드만 null
export function normalizeInbodyResult(raw: unknown, today: string): InbodyResult {
  const r =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    weight_kg: toKg(r.weight_kg, RANGE.weight_kg),
    muscle_kg: toKg(r.muscle_kg, RANGE.muscle_kg),
    fat_kg: toKg(r.fat_kg, RANGE.fat_kg),
    measured_on: toDay(r.measured_on, today),
  };
}

// Gemini 응답 텍스트 해석. JSON 객체가 아니면 invalid (호출부가 500 + 차감 되돌림)
export function parseInbodyResponse(text: string, today: string): ParsedInbody {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { status: 'invalid' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { status: 'invalid' };
  return { status: 'ok', result: normalizeInbodyResult(raw, today) };
}
