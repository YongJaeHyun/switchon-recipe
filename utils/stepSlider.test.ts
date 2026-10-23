import { describe, expect, it } from 'vitest';
import { snapMinutes, stepBy } from './stepSlider';

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
