import { describe, expect, it } from 'vitest';
import { grabOffset, isOnThumb, snapMinutes, stepBy, thumbOffset, valueAtX } from './stepSlider';

const SLIDER = { min: 360, max: 1320, step: 30 };

describe('snapMinutes', () => {
  it('가장 가까운 30분 칸으로 맞춘다', () => {
    expect(snapMinutes(1150, SLIDER)).toBe(1140);
    expect(snapMinutes(1160, SLIDER)).toBe(1170);
    expect(snapMinutes(1140, SLIDER)).toBe(1140);
  });

  it('두 칸의 한가운데면 뒤 칸', () => {
    expect(snapMinutes(375, SLIDER)).toBe(390);
    expect(snapMinutes(1155, SLIDER)).toBe(1170);
  });

  it('범위를 넘으면 끝 값', () => {
    expect(snapMinutes(0, SLIDER)).toBe(360);
    expect(snapMinutes(-200, SLIDER)).toBe(360);
    expect(snapMinutes(1320, SLIDER)).toBe(1320);
    expect(snapMinutes(1500, SLIDER)).toBe(1320);
    expect(snapMinutes(1334, SLIDER)).toBe(1320);
  });

  it('칸은 min부터 센다', () => {
    expect(snapMinutes(7, { min: 1, max: 23, step: 3 })).toBe(7);
    expect(snapMinutes(8, { min: 1, max: 23, step: 3 })).toBe(7);
    expect(snapMinutes(9, { min: 1, max: 23, step: 3 })).toBe(10);
  });

  it('시간 단위(1~23, 1칸)도 같은 규칙', () => {
    expect(snapMinutes(12.4, { min: 1, max: 23, step: 1 })).toBe(12);
    expect(snapMinutes(12.5, { min: 1, max: 23, step: 1 })).toBe(13);
    expect(snapMinutes(0, { min: 1, max: 23, step: 1 })).toBe(1);
    expect(snapMinutes(30, { min: 1, max: 23, step: 1 })).toBe(23);
  });

  it('숫자가 아니면 min', () => {
    expect(snapMinutes(Number.NaN, SLIDER)).toBe(360);
  });
});

describe('stepBy', () => {
  it('한 칸씩 움직이고 범위를 넘지 않는다', () => {
    expect(stepBy(1140, 1, SLIDER)).toBe(1170);
    expect(stepBy(1140, -1, SLIDER)).toBe(1110);
    expect(stepBy(1320, 1, SLIDER)).toBe(1320);
    expect(stepBy(360, -1, SLIDER)).toBe(360);
  });
});

// 트랙 폭 328, 손잡이 28 → 쓸 수 있는 폭 300. 06:00~22:00이면 30분 칸 하나가 9.375
const TRACK = { width: 328, thumbSize: 28 };

describe('thumbOffset', () => {
  it('값의 위치를 0~(폭-손잡이)로', () => {
    expect(thumbOffset(360, TRACK, SLIDER)).toBe(0);
    expect(thumbOffset(1320, TRACK, SLIDER)).toBe(300);
    expect(thumbOffset(840, TRACK, SLIDER)).toBe(150);
  });

  it('범위 밖 값은 끝에 붙인다', () => {
    expect(thumbOffset(0, TRACK, SLIDER)).toBe(0);
    expect(thumbOffset(1439, TRACK, SLIDER)).toBe(300);
  });

  it('폭을 모르면 0', () => {
    expect(thumbOffset(1140, { width: 0, thumbSize: 28 }, SLIDER)).toBe(0);
  });
});

describe('valueAtX', () => {
  it('손잡이 가운데 x를 칸 값으로', () => {
    expect(valueAtX(14, TRACK, SLIDER)).toBe(360);
    expect(valueAtX(314, TRACK, SLIDER)).toBe(1320);
    expect(valueAtX(164, TRACK, SLIDER)).toBe(840);
  });

  it('트랙 밖은 끝 값', () => {
    expect(valueAtX(-50, TRACK, SLIDER)).toBe(360);
    expect(valueAtX(500, TRACK, SLIDER)).toBe(1320);
  });

  it('폭을 모르면 null', () => {
    expect(valueAtX(100, { width: 0, thumbSize: 28 }, SLIDER)).toBeNull();
  });
});

describe('grabOffset', () => {
  // 1140 → offset 243.75, 가운데 257.75
  it('손잡이를 잡으면 가운데와의 차이를 기억해 값이 튀지 않는다', () => {
    const grab = grabOffset(265, 1140, TRACK, SLIDER);
    expect(grab).toBeCloseTo(-7.25);
    expect(valueAtX(265 + grab, TRACK, SLIDER)).toBe(1140);
  });

  it('손잡이에서 먼 트랙을 누르면 0 (그 자리로 간다)', () => {
    expect(grabOffset(100, 1140, TRACK, SLIDER)).toBe(0);
  });
});

describe('isOnThumb', () => {
  it('손잡이 반지름(+여유) 안이면 true', () => {
    expect(isOnThumb(257, 1140, TRACK, SLIDER)).toBe(true);
    expect(isOnThumb(100, 1140, TRACK, SLIDER)).toBe(false);
  });
});
