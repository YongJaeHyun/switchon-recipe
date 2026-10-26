import { describe, expect, it } from 'vitest';
import { nextFastingDays } from './fastingDaySelect';

// 요일 번호: 0 = 일, 1 = 월 … 6 = 토. 한 주는 월~일
describe('nextFastingDays', () => {
  it('고른 요일을 다시 누르면 빠진다', () => {
    expect(nextFastingDays([3], 3, 1)).toEqual([]);
  });

  it('개수가 남아 있으면 추가한다', () => {
    expect(nextFastingDays([1], 4, 2)).toEqual([1, 4]);
  });

  it('주 1회에서 다른 요일을 누르면 그 요일로 옮겨진다', () => {
    expect(nextFastingDays([3], 5, 1)).toEqual([5]);
  });

  it('다 고른 상태에서 새 요일을 누르면 가장 먼저 고른 요일이 빠진다', () => {
    expect(nextFastingDays([1, 3, 5], 0, 3)).toEqual([3, 5, 0]);
  });

  it('이틀 연속이 되면 고를 수 없다 (다음 날도, 전날도)', () => {
    expect(nextFastingDays([3], 4, 2)).toBeNull(); // 수 → 목
    expect(nextFastingDays([3], 2, 2)).toBeNull(); // 수 → 화
  });

  it('일요일과 다음 주 월요일은 연속으로 보지 않는다', () => {
    expect(nextFastingDays([0], 1, 2)).toEqual([0, 1]);
  });

  it('바꾸기로 빠지는 요일과는 연속이어도 된다', () => {
    // 주 2회 [월, 수]에서 화를 누르면 월이 빠지고 [수, 화]가 되는데 수·화는 연속이라 불가
    expect(nextFastingDays([1, 3], 2, 2)).toBeNull();
    // 주 2회 [화, 금]에서 수를 누르면 화가 빠지고 [금, 수] → 가능
    expect(nextFastingDays([2, 5], 3, 2)).toEqual([5, 3]);
  });
});
