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
