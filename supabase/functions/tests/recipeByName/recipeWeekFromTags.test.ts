import { describe, expect, it } from 'vitest';
import { recipeWeekFromTags, raisedWeekNote } from '../../_shared/recipeWeekFromTags.ts';

const weeks = new Map([
  ['계란', 1],
  ['두부', 1],
  ['치즈', 2],
  ['메밀면', 2],
  ['고구마', 3],
]);

describe('recipeWeekFromTags', () => {
  it('레시피 재료 중 가장 높은 주차로 저장한다 (1주차로 골랐어도 치즈가 있으면 2주차)', () => {
    expect(recipeWeekFromTags(['계란', '치즈'], weeks, 1)).toEqual({
      week: 2,
      raisedBy: ['치즈'],
    });
  });

  it('고른 주차보다 낮은 재료만이면 낮춘다 (재료로 만들기와 같은 기준), 올린 재료는 없음', () => {
    expect(recipeWeekFromTags(['계란', '두부'], weeks, 2)).toEqual({ week: 1, raisedBy: [] });
  });

  it('저장 주차는 3주차까지', () => {
    expect(recipeWeekFromTags(['고구마'], weeks, 5)).toEqual({ week: 3, raisedBy: [] });
  });

  it('올린 재료는 가장 높은 주차 재료들만', () => {
    expect(recipeWeekFromTags(['치즈', '고구마', '메밀면'], weeks, 1)).toEqual({
      week: 3,
      raisedBy: ['고구마'],
    });
  });

  it('태그가 없거나 주차를 모르면 고른 주차 그대로', () => {
    expect(recipeWeekFromTags([], weeks, 2)).toEqual({ week: 2, raisedBy: [] });
    expect(recipeWeekFromTags(['모르는재료'], weeks, 2)).toEqual({ week: 2, raisedBy: [] });
  });
});

describe('raisedWeekNote', () => {
  it('올린 재료와 주차를 한 문장으로', () => {
    expect(raisedWeekNote({ week: 2, raisedBy: ['치즈'] })).toBe(
      '치즈가 들어가 2주차 레시피로 저장했어요'
    );
    expect(raisedWeekNote({ week: 3, raisedBy: ['고구마', '단호박'] })).toBe(
      '고구마, 단호박이 들어가 3주차 레시피로 저장했어요'
    );
  });

  it('올리지 않았으면 null', () => {
    expect(raisedWeekNote({ week: 1, raisedBy: [] })).toBeNull();
  });
});
