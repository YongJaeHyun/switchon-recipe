// 주차 진입 팝업(2~4주차)을 띄울지. isChecked는 "지금 저장된 주차(prevWeek)의 팝업을 닫았는지"라서
// 주차가 올라간 순간에는 지난 주차 값이므로 보지 않는다
export function shouldOpenWeekPopup({
  prevWeek,
  week,
  isChecked,
}: {
  prevWeek: number;
  week: number;
  isChecked: boolean;
}): boolean {
  if (week < 2 || week > 4) return false;
  if (week > prevWeek) return true;
  return week === prevWeek && !isChecked;
}

// 본 주차 팝업 기억은 기기가 아니라 계정·프로그램(시작일)·주차 단위다.
// 기기에 하나만 기억하면 다른 계정(또는 다시 시작한 프로그램)에 들렀다 돌아올 때 이미 본 팝업이 다시 뜬다
export const weekPopupKey = (uid: string, startDate: string, week: number) =>
  `${uid}:${startDate.slice(0, 10)}:${week}`;

// ruleOpen = 기존 규칙(shouldOpenWeekPopup, 기기에 남은 지난 주차 기준). ownerUid = 그 기준을 남긴 계정 (모르면 null)
export function decideWeekPopup(input: {
  uid: string;
  startDate: string;
  week: number;
  beforeStart: boolean;
  ruleOpen: boolean;
  ownerUid: string | null;
  isChecked: boolean;
  seenKeys: string[];
}): { open: boolean; adoptOwner: boolean; seenKey: string | null } {
  const { uid, startDate, week, beforeStart, ruleOpen, ownerUid, isChecked, seenKeys } = input;
  const key = weekPopupKey(uid, startDate, week);
  const inRange = !beforeStart && week >= 2 && week <= 4;

  // 업데이트 직후: 지금 기기 기준을 이 계정 것으로 받아들인다. 이미 닫았던 지금 주차는 본 것으로
  if (ownerUid === null) {
    const seenKey = isChecked && inRange ? key : null;
    const open = inRange && ruleOpen && !seenKeys.includes(key) && seenKey === null;
    return { open, adoptOwner: true, seenKey };
  }

  const ownerChanged = ownerUid !== uid;
  const open = inRange && !seenKeys.includes(key) && (ruleOpen || ownerChanged);
  return { open, adoptOwner: ownerChanged, seenKey: null };
}
