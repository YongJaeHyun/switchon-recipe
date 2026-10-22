import { describe, expect, it } from 'vitest';
import { todoDailySnapshot } from './todoDaily';

describe('todoDailySnapshot', () => {
  it('stores the visible todo texts in id order and checked positions in that list', () => {
    const todos = [
      { id: 3, value: '저녁' },
      { id: 1, value: '점심' },
      { id: 2, value: '간식' },
    ];
    expect(todoDailySnapshot(todos, [3, 1])).toEqual({
      items: ['점심', '간식', '저녁'],
      checked: [0, 2],
    });
  });

  it('ignores checked ids that are not in today list (fasting day)', () => {
    expect(todoDailySnapshot([{ id: 0, value: '아침' }], [0, 2])).toEqual({
      items: ['아침'],
      checked: [0],
    });
  });

  it('handles no checks', () => {
    expect(todoDailySnapshot([{ id: 0, value: '아침' }], [])).toEqual({
      items: ['아침'],
      checked: [],
    });
  });
});
