// 슬라이더 값 맞추기. 분(06:00~22:00, 30분)·시간(1~23, 1시간) 어디에나 쓴다.
// 제스처 중 UI 스레드에서도 부르므로 worklet
export interface StepRange {
  min: number;
  max: number;
  step: number;
}

// min부터 step 칸 중 가장 가까운 값, 범위 밖이면 끝 값. 한가운데는 뒤 칸
export function snapMinutes(raw: number, { min, max, step }: StepRange): number {
  'worklet';
  if (!Number.isFinite(raw)) return min;
  const steps = Math.round((Math.min(Math.max(raw, min), max) - min) / step);
  return Math.min(min + steps * step, max);
}

// 접근성 증가·감소: 한 칸
export function stepBy(value: number, direction: 1 | -1, range: StepRange): number {
  return snapMinutes(value + direction * range.step, range);
}
