import { describe, expect, it } from 'vitest';
import { fastingDayTodos } from './fastingTodos';
import { DEFAULT_MEAL_MINUTES, mealEndMinutes, snapLegacySchedule } from './mealTimes';

const todos = ['아침', '점심', '오후간식', '저녁'];

describe('fastingDayTodos', () => {
  it('단식일은 시작 시각 전 끼니까지, 다음 날은 그 끼니부터 (옛 라벨과 같은 결과)', () => {
    // 목(4) 저녁 식후(19:00)
    expect(fastingDayTodos(todos, 4, { 4: 1140 })).toEqual(todos);
    expect(fastingDayTodos(todos, 5, { 4: 1140 })).toEqual(['저녁']);
    // 아침 식후(08:30), 점심 식후(13:00)
    expect(fastingDayTodos(todos, 4, { 4: 510 })).toEqual(['아침']);
    expect(fastingDayTodos(todos, 5, { 4: 510 })).toEqual(todos);
    expect(fastingDayTodos(todos, 4, { 4: 780 })).toEqual(['아침', '점심']);
    expect(fastingDayTodos(todos, 5, { 4: 780 })).toEqual(['점심', '오후간식', '저녁']);
  });

  it('요일마다 그 요일 시각을 쓴다', () => {
    const schedule = { 4: 780, 6: 1140 };
    expect(fastingDayTodos(todos, 4, schedule)).toEqual(['아침', '점심']);
    expect(fastingDayTodos(todos, 5, schedule)).toEqual(['점심', '오후간식', '저녁']);
    expect(fastingDayTodos(todos, 6, schedule)).toEqual(todos);
    expect(fastingDayTodos(todos, 0, schedule)).toEqual(['저녁']);
  });

  it('단식과 상관없는 날은 그대로', () => {
    expect(fastingDayTodos(todos, 2, { 4: 780 })).toEqual(todos);
    expect(fastingDayTodos(todos, 4, {})).toEqual(todos);
  });

  it('라벨이 아닌 시각은 끼니 시각과 비교한다 (끼니 시각 = 그 끼니를 마친 때)', () => {
    // 06:00 시작: 그날은 끼니 없음, 다음 날(06:00 끝)은 다 먹는다
    expect(fastingDayTodos(todos, 4, { 4: 360 })).toEqual([]);
    expect(fastingDayTodos(todos, 5, { 4: 360 })).toEqual(todos);
    // 16:00 시작: 오후간식(16:30에 마침)은 단식 중이라 빠지고, 다음 날은 오후간식부터
    expect(fastingDayTodos(todos, 4, { 4: 960 })).toEqual(['아침', '점심']);
    expect(fastingDayTodos(todos, 5, { 4: 960 })).toEqual(['오후간식', '저녁']);
    // 22:00 시작: 그날은 다 먹고, 다음 날은 22:00에 끝나 끼니 없음
    expect(fastingDayTodos(todos, 4, { 4: 1320 })).toEqual(todos);
    expect(fastingDayTodos(todos, 5, { 4: 1320 })).toEqual([]);
    // 18:30 시작: 저녁(19:00)은 단식 중이라 빠진다
    expect(fastingDayTodos(todos, 4, { 4: 1110 })).toEqual(['아침', '점심', '오후간식']);
  });

  it('끼니 마치는 시각 = 끼니 시각 + 30분 (기본값 08:30 · 13:00 · 16:30 · 19:00)', () => {
    // 옛 아침 식후 라벨(09:00) 단식: 다음 날 아침(08:30에 마침)은 아직 단식 중
    expect(fastingDayTodos(todos, 5, { 4: 540 })).toEqual(['점심', '오후간식', '저녁']);
    // 16:30 시작이면 오후간식까지
    expect(fastingDayTodos(todos, 4, { 4: 990 })).toEqual(['아침', '점심', '오후간식']);
  });

  it('사용자 끼니 시각을 쓴다', () => {
    // 아침 07:00 → 07:30에 마침, 저녁 19:30 → 20:00에 마침
    const ends = mealEndMinutes({ ...DEFAULT_MEAL_MINUTES, breakfast: 420, dinner: 1170 });
    expect(fastingDayTodos(todos, 4, { 4: 450 }, ends)).toEqual(['아침']);
    expect(fastingDayTodos(todos, 5, { 4: 450 }, ends)).toEqual(todos);
    // 19:00 시작이면 저녁(20:00에 마침)은 단식 중
    expect(fastingDayTodos(todos, 4, { 4: 1140 }, ends)).toEqual(['아침', '점심', '오후간식']);
  });

  it('리뷰 I1: 옛 아침 식후(540)로 저장된 단식은 식후로 맞춰 읽으면 다음 날 아침이 그대로 보인다', () => {
    const schedule = snapLegacySchedule({ 4: 540 }, DEFAULT_MEAL_MINUTES);
    expect(fastingDayTodos(todos, 5, schedule)).toEqual(todos);
    expect(fastingDayTodos(todos, 4, schedule)).toEqual(['아침']);
    // 옛 점심·저녁 식후는 기본 끼니 시각이면 그대로
    expect(snapLegacySchedule({ 4: 780, 5: 1140 }, DEFAULT_MEAL_MINUTES)).toEqual({
      4: 780,
      5: 1140,
    });
  });
});
