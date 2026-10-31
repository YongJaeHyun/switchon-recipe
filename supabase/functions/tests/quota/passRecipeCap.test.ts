import { describe, expect, it } from 'vitest';
import type { ExtensionForExpiry, PurchaseForExpiry } from '../../_shared/pass.ts';
import {
  DEFAULT_PASS_RECIPE_CAP_SETTING,
  passRecipeCapState,
  passRecipePeriod,
} from '../../_shared/passRecipeCap.ts';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-01T03:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

const fiveWeek = (
  token: string,
  days: number,
  status: PurchaseForExpiry['status'] = 'granted'
) => ({
  purchaseToken: token,
  productId: 'switchon_pass_5w_4900',
  purchasedAt: at(days),
  status,
});
const oneWeek = (token: string, days: number): PurchaseForExpiry => ({
  purchaseToken: token,
  productId: 'switchon_pass_1w_1500',
  purchasedAt: at(days),
  status: 'granted',
});
const ext = (token: string, days: number): ExtensionForExpiry => ({
  purchaseToken: token,
  extendedAt: at(days),
});

const setting = DEFAULT_PASS_RECIPE_CAP_SETTING;

describe('passRecipePeriod: 지금 이어지는 패스 기간의 시작과 레시피 총량', () => {
  it('기본 설정: 5주 패스 150개, 한 주 더 하기 1번에 30개', () => {
    expect(setting).toEqual({ fiveWeekTotal: 150, perWeek: 30 });
  });

  it('5주 패스 하나: 산 시각부터, 150개', () => {
    expect(passRecipePeriod([fiveWeek('a', 0)], [], at(10), setting)).toEqual({
      start: at(0),
      cap: 150,
    });
  });

  it('패스가 없거나 끝났으면 null', () => {
    expect(passRecipePeriod([], [], at(1), setting)).toBeNull();
    expect(passRecipePeriod([fiveWeek('a', 0)], [], at(35), setting)).toBeNull();
  });

  it('한 주 더 하기 연장마다 +30 (구매당 2번까지만)', () => {
    const purchases = [fiveWeek('a', 0)];
    expect(passRecipePeriod(purchases, [ext('a', 7)], at(20), setting)).toEqual({
      start: at(0),
      cap: 180,
    });
    expect(
      passRecipePeriod(purchases, [ext('a', 7), ext('a', 14), ext('a', 21)], at(20), setting)
    ).toEqual({ start: at(0), cap: 210 });
  });

  it('연장으로 늘어난 기간에도 같은 기간으로 센다 (35일 뒤라도 연장분 안이면)', () => {
    expect(passRecipePeriod([fiveWeek('a', 0)], [ext('a', 7)], at(40), setting)).toEqual({
      start: at(0),
      cap: 180,
    });
  });

  it('패스가 끝난 뒤의 연장 기록·환불된 구매에 묶인 연장은 세지 않는다', () => {
    expect(passRecipePeriod([fiveWeek('a', 0)], [ext('a', 40)], at(36), setting)).toBeNull();
    expect(
      passRecipePeriod(
        [fiveWeek('a', 0, 'voided'), fiveWeek('b', 1)],
        [ext('a', 7)],
        at(10),
        setting
      )
    ).toEqual({ start: at(1), cap: 150 });
  });

  it('남아 있을 때 산 패스는 기간을 잇고 총량을 더한다 (시작은 처음 산 시각)', () => {
    expect(passRecipePeriod([fiveWeek('a', 0), fiveWeek('b', 20)], [], at(50), setting)).toEqual({
      start: at(0),
      cap: 300,
    });
  });

  it('끝난 뒤 새로 산 5주 패스는 새 기간: 다시 150개부터', () => {
    expect(
      // a: 0일 + 35일 + 연장 7일 = 42일에 끝남. 45일에 산 b는 새 기간
      passRecipePeriod([fiveWeek('a', 0), fiveWeek('b', 45)], [ext('a', 7)], at(50), setting)
    ).toEqual({ start: at(45), cap: 150 });
  });

  it('1주 패스는 30개 (연장 없음)', () => {
    expect(passRecipePeriod([oneWeek('w', 0)], [ext('w', 3)], at(5), setting)).toEqual({
      start: at(0),
      cap: 30,
    });
  });

  it('설정값을 따른다', () => {
    expect(
      passRecipePeriod([fiveWeek('a', 0)], [ext('a', 7)], at(10), {
        fiveWeekTotal: 100,
        perWeek: 10,
      })
    ).toEqual({ start: at(0), cap: 110 });
  });
});

describe('passRecipeCapState: 이번 기간에 만든 수로 남은 총량', () => {
  it('남은 수 = 총량 - 만든 수, 다 쓰면 capReached', () => {
    expect(passRecipeCapState({ start: at(0), cap: 150 }, 130)).toEqual({
      capReached: false,
      totalLimit: 150,
      totalRemaining: 20,
    });
    expect(passRecipeCapState({ start: at(0), cap: 150 }, 150)).toEqual({
      capReached: true,
      totalLimit: 150,
      totalRemaining: 0,
    });
    expect(passRecipeCapState({ start: at(0), cap: 150 }, 170)).toMatchObject({
      capReached: true,
      totalRemaining: 0,
    });
  });

  it('기간을 모르면(구매 기록 없이 운영자가 준 패스 등) 총량 제한 없음', () => {
    expect(passRecipeCapState(null, 999)).toEqual({
      capReached: false,
      totalLimit: null,
      totalRemaining: null,
    });
  });
});
