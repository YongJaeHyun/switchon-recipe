import { describe, expect, it } from 'vitest';
import {
  afterMealMinutes,
  DEFAULT_MEAL_MINUTES,
  defaultFastingStart,
  mealEndMinutes,
  normalizeMealTimes,
  quickTimes,
  snapLegacyMinutes,
  snapLegacySchedule,
} from './mealTimes';
import { formatMinutes } from './fastingSchedule';

describe('mealTimes', () => {
  it('기본 끼니 시각: 08:00 · 12:30 · 16:00 · 18:30', () => {
    expect(DEFAULT_MEAL_MINUTES).toEqual({ breakfast: 480, lunch: 750, snack: 960, dinner: 1110 });
  });

  it('식후 = 끼니 + 30분. 기본값이면 08:30 · 13:00 · 16:30 · 19:00', () => {
    const after = afterMealMinutes(DEFAULT_MEAL_MINUTES);
    expect(after).toEqual({ breakfast: 510, lunch: 780, snack: 990, dinner: 1140 });
    expect(formatMinutes(after.breakfast)).toBe('08:30');
    expect(formatMinutes(after.lunch)).toBe('13:00');
    expect(formatMinutes(after.dinner)).toBe('19:00');
  });

  it('빠른 선택(아침·점심·저녁 식후)은 사용자 끼니 시각에서', () => {
    expect(quickTimes(DEFAULT_MEAL_MINUTES)).toEqual([
      { label: '아침 식후', minutes: 510 },
      { label: '점심 식후', minutes: 780 },
      { label: '저녁 식후', minutes: 1140 },
    ]);
    expect(quickTimes({ breakfast: 420, lunch: 720, snack: 900, dinner: 1200 })).toEqual([
      { label: '아침 식후', minutes: 450 },
      { label: '점심 식후', minutes: 750 },
      { label: '저녁 식후', minutes: 1230 },
    ]);
  });

  it('새 요일 기본 단식 시작 = 저녁 식후', () => {
    expect(defaultFastingStart(DEFAULT_MEAL_MINUTES)).toBe(1140);
    expect(defaultFastingStart({ ...DEFAULT_MEAL_MINUTES, dinner: 1080 })).toBe(1110);
  });

  it('끼니 마치는 시각은 할 일 순서(아침·점심·오후간식·저녁)', () => {
    expect(mealEndMinutes(DEFAULT_MEAL_MINUTES)).toEqual([510, 780, 990, 1140]);
  });

  it('저장된 값이 이상하면 그 끼니만 기본값', () => {
    expect(normalizeMealTimes(undefined)).toEqual(DEFAULT_MEAL_MINUTES);
    expect(normalizeMealTimes({ breakfast: 420, lunch: 'x', snack: 961, dinner: 1200 })).toEqual({
      breakfast: 420,
      lunch: 750,
      snack: 960,
      dinner: 1200,
    });
    // 끼니 휠 범위 밖
    expect(normalizeMealTimes({ ...DEFAULT_MEAL_MINUTES, breakfast: 1200 }).breakfast).toBe(480);
  });

  it('옛 식후 라벨 시각(540·780·1140)은 지금 사용자 식후로 읽는다 (보이는 할 일·빠른 선택 표시용)', () => {
    expect(snapLegacyMinutes(540, DEFAULT_MEAL_MINUTES)).toBe(510);
    expect(snapLegacyMinutes(780, DEFAULT_MEAL_MINUTES)).toBe(780);
    expect(snapLegacyMinutes(1140, DEFAULT_MEAL_MINUTES)).toBe(1140);
    expect(snapLegacyMinutes(600, DEFAULT_MEAL_MINUTES)).toBe(600);
    const custom = { breakfast: 420, lunch: 720, snack: 900, dinner: 1200 };
    expect(snapLegacyMinutes(540, custom)).toBe(450);
    expect(snapLegacyMinutes(780, custom)).toBe(750);
    expect(snapLegacyMinutes(1140, custom)).toBe(1230);
    expect(snapLegacySchedule({ 4: 540, 6: 600 }, DEFAULT_MEAL_MINUTES)).toEqual({
      4: 510,
      6: 600,
    });
  });
});
