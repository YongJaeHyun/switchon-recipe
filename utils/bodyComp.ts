import { round1 } from './weight';

// 인바디 값 범위 (kg). 마이그레이션 20261030020000_weight_body_comp.sql의 check와 같다
export const BODY_COMP_RANGE = {
  muscle: { min: 5, max: 100 },
  fat: { min: 1, max: 200 },
} as const;

export type BodyCompKind = keyof typeof BODY_COMP_RANGE;

// 그날 골격근량·체지방량. 없으면 null
export interface BodyComp {
  muscle_kg: number | null;
  fat_kg: number | null;
}

// 저장 요청. 인바디 키는 바꾼 것만 넣는다 (키 없음 = 서버 값 그대로, null = 지움)
export interface WeightUpsertPayload {
  day: string;
  weight_kg: number;
  muscle_kg?: number | null;
  fat_kg?: number | null;
}

// 입력 문자열 → kg(소수 한 자리). 빈칸이면 null(입력 안 함), 숫자가 아니거나 범위 밖이면 'invalid'
export function parseBodyCompInput(text: string, kind: BodyCompKind): number | null | 'invalid' {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 'invalid';
  const value = round1(Number(normalized));
  const { min, max } = BODY_COMP_RANGE[kind];
  if (!Number.isFinite(value) || value < min || value > max) return 'invalid';
  return value;
}

// 저장 payload. 인바디는 시트를 열 때 값(initial)과 달라진 필드만 넣는다:
// 체중만 고쳐 저장해도 같은 날 인바디 값이 지워지지 않고, 있던 값을 비우면 그 필드만 null로 지운다
export function weightUpsertPayload({
  day,
  weight_kg,
  initial,
  input,
}: {
  day: string;
  weight_kg: number;
  initial: BodyComp;
  input: BodyComp;
}): WeightUpsertPayload {
  const payload: WeightUpsertPayload = { day, weight_kg };
  if (input.muscle_kg !== initial.muscle_kg) payload.muscle_kg = input.muscle_kg;
  if (input.fat_kg !== initial.fat_kg) payload.fat_kg = input.fat_kg;
  return payload;
}

// 입력 시트에 미리 채울 인바디 값: 그날 기록 값만 (체중과 달리 전날 값은 가져오지 않는다)
export function prefillBodyComp(
  logs: ({ day: string } & Partial<BodyComp>)[],
  day: string
): BodyComp {
  const log = logs.find((l) => l.day === day);
  return { muscle_kg: log?.muscle_kg ?? null, fat_kg: log?.fat_kg ?? null };
}

// 기록 목록 표시: "골격근 27.1 · 체지방 19.8". 둘 다 없으면 null
export function formatBodyComp({ muscle_kg, fat_kg }: BodyComp): string | null {
  const parts = [
    muscle_kg != null && `골격근 ${muscle_kg.toFixed(1)}`,
    fat_kg != null && `체지방 ${fat_kg.toFixed(1)}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
