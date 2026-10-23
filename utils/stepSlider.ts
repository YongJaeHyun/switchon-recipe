// 슬라이더 값 맞추기. 분(06:00~22:00, 30분)·시간(1~23, 1시간) 어디에나 쓴다.
// 제스처 중 UI 스레드에서도 부르므로 worklet
export interface StepRange {
  min: number;
  max: number;
  step: number;
}

// min부터 step 칸 중 가장 가까운 값, 범위 밖이면 끝 값. 한가운데는 뒤 칸.
// (max - min)이 step의 배수가 아니면 max가 칸 밖 값이 될 수 있으니 배수로 정한다
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

// 슬라이더 트랙 크기. width는 전체 폭, 손잡이 가운데가 [thumbSize/2, width - thumbSize/2]를 움직인다
export interface TrackSize {
  width: number;
  thumbSize: number;
}

// 손잡이를 잡았다고 보는 거리 (손잡이 반지름 + 여유)
const GRAB_SLOP = 8;

// 값 → 손잡이 왼쪽 위치. 범위 밖 값도 트랙 안에 그린다
export function thumbOffset(
  value: number,
  { width, thumbSize }: TrackSize,
  range: StepRange
): number {
  'worklet';
  const usable = width - thumbSize;
  if (usable <= 0 || range.max <= range.min) return 0;
  const ratio = Math.min(Math.max((value - range.min) / (range.max - range.min), 0), 1);
  return ratio * usable;
}

// 손잡이 가운데가 x일 때의 칸 값. 폭을 아직 모르면 null
export function valueAtX(
  x: number,
  { width, thumbSize }: TrackSize,
  range: StepRange
): number | null {
  'worklet';
  const usable = width - thumbSize;
  if (usable <= 0) return null;
  const ratio = Math.min(Math.max((x - thumbSize / 2) / usable, 0), 1);
  return snapMinutes(range.min + ratio * (range.max - range.min), range);
}

export function isOnThumb(x: number, value: number, track: TrackSize, range: StepRange): boolean {
  'worklet';
  const center = thumbOffset(value, track, range) + track.thumbSize / 2;
  return Math.abs(x - center) <= track.thumbSize / 2 + GRAB_SLOP;
}

// 누른 점과 손잡이 가운데의 차이. 손잡이를 잡았으면 끄는 동안 이만큼 보정해 값이 튀지 않게 하고,
// 트랙의 다른 곳을 눌렀으면 0 (그 자리로 간다)
export function grabOffset(x: number, value: number, track: TrackSize, range: StepRange): number {
  'worklet';
  if (!isOnThumb(x, value, track, range)) return 0;
  return thumbOffset(value, track, range) + track.thumbSize / 2 - x;
}
