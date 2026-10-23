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
