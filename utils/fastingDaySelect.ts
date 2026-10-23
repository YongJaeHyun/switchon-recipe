// 단식 요일 고르기. 요일 번호는 0 = 일 … 6 = 토이고, 한 주는 월~일로 본다.
// 이틀 연속 단식은 안 되므로 같은 주 안에서 바로 앞뒤 요일끼리는 함께 고를 수 없다
const weekPosition = (day: number) => (day + 6) % 7; // 월 0 … 일 6

const isNextTo = (a: number, b: number) => Math.abs(weekPosition(a) - weekPosition(b)) === 1;

// 요일을 눌렀을 때의 새 선택. 이미 고른 요일은 빼고, 개수가 다 찼으면 가장 먼저 고른 요일을 빼고 넣는다.
// 이틀 연속이 되어 고를 수 없으면 null
export function nextFastingDays(selected: number[], day: number, max: number): number[] | null {
  if (selected.includes(day)) return selected.filter((d) => d !== day);

  const kept = selected.length < max ? selected : selected.slice(selected.length - max + 1);
  if (kept.some((d) => isNextTo(d, day))) return null;
  return [...kept, day];
}
