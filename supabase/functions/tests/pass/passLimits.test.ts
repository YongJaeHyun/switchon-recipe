import { describe, expect, it } from 'vitest';
import { INBODY_DAILY_LIMIT as handlerInbodyLimit } from '../../read-inbody/handler.ts';
import { PASS_DAYS, WEEK_PASS_PRODUCT } from '../../_shared/pass.ts';
import { buildPassLimits, INBODY_DAILY_LIMIT } from '../../_shared/passLimits.ts';

const quota = { pass_daily: 20, pass_recipe_total: 150, pass_recipe_per_week: 30 };
const premium = [
  { feature: 'food_check', daily: 30 },
  { feature: 'recipe_name_check', daily: 10 },
];

describe('패스 이용 한도 (get-pass-status limits)', () => {
  it('인바디 결과지 읽기는 하루 3번이고 read-inbody가 같은 값을 쓴다', () => {
    expect(INBODY_DAILY_LIMIT).toBe(3);
    expect(handlerInbodyLimit).toBe(INBODY_DAILY_LIMIT);
  });

  it('DB 설정 값과 패스 일수로 한도를 만든다', () => {
    expect(buildPassLimits(quota, premium)).toEqual({
      recipeDaily: 20,
      recipePerPass: 150,
      recipePerWeek: 30,
      nameCheckDaily: 10,
      foodCheckDaily: 30,
      inbodyDaily: 3,
      fiveWeekDays: PASS_DAYS,
      weekPassDays: WEEK_PASS_PRODUCT.days,
    });
  });

  it('설정 행이나 값이 빠지면 null (틀린 숫자를 보여 주지 않도록)', () => {
    expect(buildPassLimits(null, premium)).toBeNull();
    expect(buildPassLimits({ ...quota, pass_recipe_total: undefined }, premium)).toBeNull();
    expect(buildPassLimits(quota, [premium[0]])).toBeNull();
    expect(buildPassLimits(quota, [{ feature: 'food_check', daily: '30' }, premium[1]])).toBeNull();
  });
});
