import { describe, expect, it } from 'vitest';
import { fastingDayTodos } from './fastingTodos';

const todos = ['아침', '점심', '오후간식', '저녁'];

describe('fastingDayTodos', () => {
  it('단식일은 시작 시각 전 끼니까지, 다음 날은 그 끼니부터 (옛 라벨과 같은 결과)', () => {
    // 목(4) 저녁 식후(19:00)
    expect(fastingDayTodos(todos, 4, { 4: 1140 })).toEqual(todos);
    expect(fastingDayTodos(todos, 5, { 4: 1140 })).toEqual(['저녁']);
    // 아침 식후(09:00), 점심 식후(13:00)
    expect(fastingDayTodos(todos, 4, { 4: 540 })).toEqual(['아침']);
    expect(fastingDayTodos(todos, 5, { 4: 540 })).toEqual(todos);
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
});
