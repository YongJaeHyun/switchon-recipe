// 시작 전 준비 체크리스트 상태. 시작일에 묶어 두어, 시작일이 바뀌면(다시 시작·다른 계정) 예전 체크가 남지 않는다

export type PrepItemId = 'shake' | 'rules' | 'groceries' | 'mealAlarm';

export type PrepChecks = Partial<Record<PrepItemId, boolean>>;

export interface PrepState {
  startDate: string | null; // yyyy-MM-dd
  checks: PrepChecks;
}

export const EMPTY_PREP: PrepState = { startDate: null, checks: {} };

const dateOnly = (startDate: string | null | undefined) =>
  startDate ? startDate.slice(0, 10) : null;

// 이 시작일의 체크. 다른 시작일에 남긴 체크면 빈 값
export function prepChecksFor(prep: PrepState, startDate: string | null | undefined): PrepChecks {
  const key = dateOnly(startDate);
  return key !== null && prep.startDate === key ? prep.checks : {};
}

// 이 시작일의 한 항목을 켜고 끈다. 시작일이 바뀌었으면 예전 체크를 버리고 새로 시작
export function setPrepCheck(
  prep: PrepState,
  startDate: string | null | undefined,
  id: PrepItemId,
  value: boolean
): PrepState {
  const key = dateOnly(startDate);
  return { startDate: key, checks: { ...prepChecksFor(prep, key), [id]: value } };
}
