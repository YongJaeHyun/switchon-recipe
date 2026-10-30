import { describe, expect, it } from 'vitest';
import { carbTypeStyle } from './carbType';

describe('carbTypeStyle', () => {
  it('무탄수는 초록', () => {
    const style = carbTypeStyle(true);
    expect(style.label).toBe('무탄수');
    expect(style.mealLabel).toBe('무탄수식');
    expect(style.hex).toBe('#16a34a');
    expect(style.badgeText).toBe('text-green-700');
  });

  it('저탄수는 앰버', () => {
    const style = carbTypeStyle(false);
    expect(style.label).toBe('저탄수');
    expect(style.mealLabel).toBe('저탄수식');
    expect(style.hex).toBe('#f59e0b');
    expect(style.badgeText).toBe('text-amber-700');
  });

  it('값이 없으면 지금 카드처럼 저탄수', () => {
    expect(carbTypeStyle(null).label).toBe('저탄수');
    expect(carbTypeStyle(undefined).label).toBe('저탄수');
  });
});
