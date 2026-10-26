import { describe, expect, it } from 'vitest';
import {
  dragTargetIndex,
  indexAtOffset,
  joinTime,
  nearestIndex,
  offsetAtIndex,
  rangeItems,
  splitTime,
  stepIndex,
} from './wheelPicker';

const pad2 = (n: number) => String(n).padStart(2, '0');

describe('rangeItems', () => {
  it('min부터 max까지 step 칸, 라벨은 format', () => {
    expect(rangeItems(0, 50, 10, pad2)).toEqual([
      { value: 0, label: '00' },
      { value: 10, label: '10' },
      { value: 20, label: '20' },
      { value: 30, label: '30' },
      { value: 40, label: '40' },
      { value: 50, label: '50' },
    ]);
    expect(rangeItems(6, 22, 1, String)).toHaveLength(17);
    expect(rangeItems(6, 22, 1, String)[16]).toEqual({ value: 22, label: '22' });
  });
});

describe('nearestIndex', () => {
  const items = rangeItems(0, 50, 10, pad2);
  it('같은 값의 칸', () => {
    expect(nearestIndex(items, 0)).toBe(0);
    expect(nearestIndex(items, 30)).toBe(3);
    expect(nearestIndex(items, 50)).toBe(5);
  });
  it('없는 값은 가장 가까운 칸, 한가운데는 앞 칸, 범위 밖은 끝 칸', () => {
    expect(nearestIndex(items, 14)).toBe(1);
    expect(nearestIndex(items, 16)).toBe(2);
    expect(nearestIndex(items, 15)).toBe(1);
    expect(nearestIndex(items, -30)).toBe(0);
    expect(nearestIndex(items, 99)).toBe(5);
  });
  it('빈 목록은 0', () => {
    expect(nearestIndex([], 3)).toBe(0);
  });
});

describe('offset ↔ index', () => {
  it('칸 높이로 나눠 가장 가까운 칸, 범위 안으로', () => {
    expect(offsetAtIndex(3, 40)).toBe(120);
    expect(indexAtOffset(120, 40, 6)).toBe(3);
    expect(indexAtOffset(139, 40, 6)).toBe(3);
    expect(indexAtOffset(141, 40, 6)).toBe(4);
    expect(indexAtOffset(-25, 40, 6)).toBe(0);
    expect(indexAtOffset(1000, 40, 6)).toBe(5);
  });
  it('칸이 없거나 높이가 0이면 0', () => {
    expect(indexAtOffset(100, 40, 0)).toBe(0);
    expect(indexAtOffset(100, 0, 6)).toBe(0);
  });
});

describe('stepIndex', () => {
  it('한 칸 위아래, 끝에서 멈춤', () => {
    expect(stepIndex(2, 1, 6)).toBe(3);
    expect(stepIndex(2, -1, 6)).toBe(1);
    expect(stepIndex(5, 1, 6)).toBe(5);
    expect(stepIndex(0, -1, 6)).toBe(0);
  });
});

describe('splitTime / joinTime', () => {
  it('분 → 시·분 (분은 step으로 내림)', () => {
    expect(splitTime(1140, 10)).toEqual({ hour: 19, minute: 0 });
    expect(splitTime(1170, 10)).toEqual({ hour: 19, minute: 30 });
    expect(splitTime(995, 10)).toEqual({ hour: 16, minute: 30 });
    expect(splitTime(0, 10)).toEqual({ hour: 0, minute: 0 });
  });
  it('시·분 → 분', () => {
    expect(joinTime(22, 50)).toBe(1370);
    expect(joinTime(0, 10)).toBe(10);
  });
});

describe('dragTargetIndex', () => {
  const ROW = 40;
  it('0.3칸 이상 끌면 그 방향으로 적어도 한 칸', () => {
    expect(dragTargetIndex(3, 3.35 * ROW, ROW, 10)).toBe(4);
    expect(dragTargetIndex(3, 2.65 * ROW, ROW, 10)).toBe(2);
    expect(dragTargetIndex(3, 3.3 * ROW, ROW, 10)).toBe(4);
  });
  it('0.3칸보다 덜 끌면 제자리', () => {
    expect(dragTargetIndex(3, 3.2 * ROW, ROW, 10)).toBe(3);
    expect(dragTargetIndex(3, 2.8 * ROW, ROW, 10)).toBe(3);
    expect(dragTargetIndex(3, 3 * ROW, ROW, 10)).toBe(3);
  });
  it('많이 끌거나 튕긴 끝 위치는 가장 가까운 칸', () => {
    expect(dragTargetIndex(3, 4.4 * ROW, ROW, 10)).toBe(4);
    expect(dragTargetIndex(3, 4.6 * ROW, ROW, 10)).toBe(5);
    expect(dragTargetIndex(3, 8.4 * ROW, ROW, 10)).toBe(8);
    expect(dragTargetIndex(3, 0.6 * ROW, ROW, 10)).toBe(1);
  });
  it('범위 안으로', () => {
    expect(dragTargetIndex(9, 9.5 * ROW, ROW, 10)).toBe(9);
    expect(dragTargetIndex(0, -0.5 * ROW, ROW, 10)).toBe(0);
    expect(dragTargetIndex(3, 30 * ROW, ROW, 10)).toBe(9);
  });
  it('칸이 없거나 높이가 0이면 0', () => {
    expect(dragTargetIndex(3, 100, ROW, 0)).toBe(0);
    expect(dragTargetIndex(3, 100, 0, 10)).toBe(0);
  });
});
