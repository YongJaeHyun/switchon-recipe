import { describe, expect, it } from 'vitest';
import { getWeekColorHex, getWeekInkHex, getWeekOnColorHex } from './getWeekColor';

// WCAG 상대 휘도 대비
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// tailwind colors의 white·black은 #fff·#000 세 자리
const toHex = (color: string) =>
  /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color;

describe('주차 색 위 글자 대비 (칩 라벨 16px)', () => {
  // 운영자 결정(2026-11-01): 주차 색으로 채운 칩의 글자는 늘 흰색 (대비보다 앱 전체 통일을 우선, 글자는 굵게)
  it.each([1, 2, 3, 4, 5])('%i주차: 주차 색으로 채운 칩 위 글자는 흰색', (week) => {
    expect(toHex(getWeekOnColorHex(week))).toBe('#ffffff');
  });

  it.each([1, 2, 3, 4, 5])('%i주차: 흰 칩 위 주차 글자색은 4.5:1 이상', (week) => {
    expect(contrast('#ffffff', toHex(getWeekInkHex(week)))).toBeGreaterThanOrEqual(4.5);
  });

});
