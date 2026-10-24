// 세로 휠(WheelPicker) 칸 계산. 칸 i의 가운데가 띠에 오는 스크롤 위치 = i * 칸 높이
export interface WheelItem {
  value: number;
  label: string;
}

// min부터 max까지 step 칸
export function rangeItems(
  min: number,
  max: number,
  step: number,
  format: (value: number) => string
): WheelItem[] {
  const items: WheelItem[] = [];
  for (let value = min; value <= max; value += step) items.push({ value, label: format(value) });
  return items;
}

// value와 가장 가까운 칸. 한가운데는 앞 칸, 범위 밖은 끝 칸
export function nearestIndex(items: WheelItem[], value: number): number {
  let best = 0;
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].value - value) < Math.abs(items[best].value - value)) best = i;
  }
  return best;
}

export function offsetAtIndex(index: number, rowHeight: number): number {
  return index * rowHeight;
}

// 스크롤 위치 → 띠에 온 칸
export function indexAtOffset(offset: number, rowHeight: number, count: number): number {
  if (count <= 0 || rowHeight <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / rowHeight)));
}

// 접근성 증가·감소: 한 칸, 끝에서 멈춤
export function stepIndex(index: number, direction: 1 | -1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + direction));
}

// 분 → 시·분 (분은 minuteStep으로 내림)
export function splitTime(total: number, minuteStep: number): { hour: number; minute: number } {
  const hour = Math.floor(total / 60);
  const minute = Math.floor((total % 60) / minuteStep) * minuteStep;
  return { hour, minute };
}

export function joinTime(hour: number, minute: number): number {
  return hour * 60 + minute;
}

// 이만큼(칸) 넘게 끌면 한 칸 넘어간다. Android는 손가락이 처음 움직인 만큼(touch slop)을 스크롤로 치지 않아
// 한 칸을 끌어도 0.5칸이 안 될 수 있다
export const DRAG_STEP_THRESHOLD = 0.3;

// 끌기·튕기기가 멈췄을 때 고를 칸. 끌기 시작 칸에서 THRESHOLD칸 이상 움직였으면 그 방향으로 적어도 한 칸,
// 더 움직였으면 가장 가까운 칸. 범위 안으로
export function dragTargetIndex(
  startIndex: number,
  offset: number,
  rowHeight: number,
  count: number
): number {
  if (count <= 0 || rowHeight <= 0) return 0;
  const delta = offset / rowHeight - startIndex;
  const moved = Math.abs(delta);
  const steps = moved + 1e-9 < DRAG_STEP_THRESHOLD ? 0 : Math.max(1, Math.round(moved));
  return Math.min(count - 1, Math.max(0, startIndex + Math.sign(delta) * steps));
}
