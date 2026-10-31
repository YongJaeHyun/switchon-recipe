import { describe, expect, it } from 'vitest';
import type { PassLimits } from 'types/pass';
import { getPassLimitRows, PASS_LIMITS_RESET_NOTE } from './passLimits';

const limits: PassLimits = {
  recipeDaily: 20,
  recipePerPass: 150,
  recipePerWeek: 30,
  nameCheckDaily: 10,
  foodCheckDaily: 30,
  inbodyDaily: 3,
  fiveWeekDays: 35,
  weekPassDays: 7,
};

describe('getPassLimitRows', () => {
  it('5주 패스: 레시피 총량과 한 주 더 하기 추가분', () => {
    expect(getPassLimitRows(limits, 'fiveWeek')).toEqual([
      {
        icon: 'menu-book',
        label: '레시피 만들기',
        value: '하루 20개 · 이 패스로 150개까지',
        note: '한 주 더 하면 +30개',
      },
      {
        icon: 'edit-note',
        label: '이름으로 만들기',
        value: '레시피 개수 안에서, 이름 확인 하루 10번',
        note: null,
      },
      { icon: 'fact-check', label: '음식 판정', value: '하루 30번', note: null },
      { icon: 'photo-camera', label: '인바디 결과지', value: '하루 3번', note: null },
      {
        icon: 'insights',
        label: '주간 리포트',
        value: '1주차~유지기 1주차, 매주 자동으로 정리해 드려요',
        note: null,
      },
      {
        icon: 'event',
        label: '기간',
        value: '5주 패스 35일 · 1주 패스 7일, 마지막 날 밤 11시 59분까지',
        note: null,
      },
    ]);
  });

  it('1주 패스: 1주 몫 총량만, 연장 안내 없음', () => {
    const recipe = getPassLimitRows(limits, 'week')[0];
    expect(recipe.value).toBe('하루 20개 · 이 패스로 30개까지');
    expect(recipe.note).toBeNull();
  });

  it('서버 값을 그대로 쓴다', () => {
    const rows = getPassLimitRows(
      { ...limits, recipeDaily: 15, recipePerPass: 100, recipePerWeek: 20, inbodyDaily: 5 },
      'fiveWeek'
    );
    expect(rows[0].value).toBe('하루 15개 · 이 패스로 100개까지');
    expect(rows[0].note).toBe('한 주 더 하면 +20개');
    expect(rows[3].value).toBe('하루 5번');
  });

  it('한도가 없으면(옛 서버·조회 실패) 빈 목록', () => {
    expect(getPassLimitRows(undefined, 'fiveWeek')).toEqual([]);
  });

  it('자정 안내 문구', () => {
    expect(PASS_LIMITS_RESET_NOTE).toBe('하루 한도는 매일 자정(한국 시간)에 다시 채워져요');
  });
});
