import type { SalesState } from 'types/pass';
import { describe, expect, it } from 'vitest';
import {
  canPurchasePassSelection,
  getPassCtaLabel,
  getPassOptions,
  getPassRecipeLine,
  getRepeatWeekNote,
  passProgramWeek,
  selectPassOption,
} from './passOptions';

const sales: SalesState = {
  onSale: true,
  freeActive: false,
  tier: 'early1',
  productId: 'switchon_pass_5w_1900',
  priceKrw: 1900,
  freeDaysLeft: 0,
  nextTier: { tier: 'early2', priceKrw: 2900, startsAt: '2026-11-07T15:00:00.000Z' },
  weekPass: { productId: 'switchon_pass_1w_1500', priceKrw: 1500, days: 7 },
};

describe('getPassOptions', () => {
  it('5주 패스(추천)와 1주 패스를 이 순서로 보여준다', () => {
    expect(getPassOptions(sales, 1)).toEqual([
      {
        kind: 'fiveWeek',
        productId: 'switchon_pass_5w_1900',
        days: 35,
        title: '스위치온 패스',
        subtitle: '5주 · 한 회차 전체',
        price: '1,900원',
        perWeek: '주당 380원',
        original: '4,900원',
        badge: '61% 할인',
        recommended: true,
      },
      {
        kind: 'week',
        productId: 'switchon_pass_1w_1500',
        days: 7,
        title: '1주 패스',
        subtitle: '7일 · 써 보거나 한 주 더 할 때',
        price: '1,500원',
        perWeek: null,
        original: null,
        badge: null,
        recommended: false,
      },
    ]);
  });

  it('5주 패스 가격은 지금 가격 구간을 따른다', () => {
    const [fiveWeek] = getPassOptions(
      {
        ...sales,
        productId: 'switchon_pass_5w_4900',
        priceKrw: 4900,
      },
      1
    );
    expect(fiveWeek).toMatchObject({
      productId: 'switchon_pass_5w_4900',
      price: '4,900원',
      perWeek: '주당 980원',
    });
  });

  it('정가(정규 구간)면 5주 패스에 할인 표시가 없다', () => {
    const [fiveWeek] = getPassOptions(
      { ...sales, tier: 'regular', productId: 'switchon_pass_5w_4900', priceKrw: 4900 },
      1
    );
    expect(fiveWeek).toMatchObject({ original: null, badge: null });
  });

  it('2차 할인 구간은 40% 할인', () => {
    const [fiveWeek] = getPassOptions(
      { ...sales, productId: 'switchon_pass_5w_2900', priceKrw: 2900 },
      1
    );
    expect(fiveWeek).toMatchObject({ original: '4,900원', badge: '40% 할인' });
  });

  it('1주 패스가 판매 중이 아니면(null) 5주 패스만', () => {
    expect(getPassOptions({ ...sales, weekPass: null }, 1).map((o) => o.kind)).toEqual([
      'fiveWeek',
    ]);
  });

  it('weekPass를 모르는 구버전 서버 응답이면 5주 패스만', () => {
    const { weekPass: _omit, ...old } = sales;
    expect(getPassOptions(old, 1).map((o) => o.kind)).toEqual(['fiveWeek']);
  });

  it('5주 상품이 없으면 1주 패스만', () => {
    expect(
      getPassOptions({ ...sales, productId: null, priceKrw: null }, 1).map((o) => o.kind)
    ).toEqual(['week']);
  });

  it('판매 중이 아니면 빈 목록', () => {
    expect(getPassOptions({ ...sales, onSale: false }, 1)).toEqual([]);
  });
});

describe('getPassOptions 추천', () => {
  const recommendedOf = (week: number | null) =>
    getPassOptions(sales, week).map((o) => [o.kind, o.recommended]);

  it('1~3주차면 5주 패스를 추천하고 먼저 보여준다', () => {
    for (const week of [1, 2, 3]) {
      expect(recommendedOf(week)).toEqual([
        ['fiveWeek', true],
        ['week', false],
      ]);
    }
  });

  it('4주차부터(유지기 포함) 1주 패스를 추천하고 먼저 보여준다', () => {
    for (const week of [4, 5]) {
      expect(recommendedOf(week)).toEqual([
        ['week', true],
        ['fiveWeek', false],
      ]);
    }
  });

  it('시작일을 모르면 5주 패스 추천', () => {
    expect(recommendedOf(null)[0]).toEqual(['fiveWeek', true]);
  });

  it('유저를 불러오는 중이면 추천하지 않고 5주 패스부터', () => {
    expect(getPassOptions(sales, 'loading').map((o) => [o.kind, o.recommended])).toEqual([
      ['fiveWeek', false],
      ['week', false],
    ]);
  });

  it('4주차여도 1주 패스가 없으면 5주 패스 추천', () => {
    expect(getPassOptions({ ...sales, weekPass: null }, 4).map((o) => o.recommended)).toEqual([
      true,
    ]);
  });
});

describe('passProgramWeek', () => {
  const today = '2026-10-31';

  it('유저를 아직 불러오지 않았으면(id 없음) loading — 빈 시작일을 1주차로 보지 않는다', () => {
    expect(passProgramWeek({ userId: '', startDate: '', today })).toBe('loading');
    expect(passProgramWeek({ userId: null, startDate: '2026-10-01', today })).toBe('loading');
  });

  it('불러온 유저에게 시작일이 없으면 null', () => {
    expect(passProgramWeek({ userId: 'u1', startDate: '', today })).toBeNull();
    expect(passProgramWeek({ userId: 'u1', startDate: null, today })).toBeNull();
  });

  it('시작일이 있으면 오늘 주차', () => {
    expect(passProgramWeek({ userId: 'u1', startDate: '2026-10-31', today })).toBe(1);
    expect(passProgramWeek({ userId: 'u1', startDate: '2026-10-10', today })).toBe(4);
    expect(passProgramWeek({ userId: 'u1', startDate: '2026-09-01', today })).toBe(9);
  });

  it('시작 전이면 1주차', () => {
    expect(passProgramWeek({ userId: 'u1', startDate: '2026-11-02', today })).toBe(1);
  });

  it('불러오면 추천이 주차를 따른다 (4주차 → 1주 패스)', () => {
    const week = passProgramWeek({ userId: 'u1', startDate: '2026-10-10', today });
    expect(selectPassOption(getPassOptions(sales, week), null)?.kind).toBe('week');
  });
});

describe('canPurchasePassSelection', () => {
  it('유저를 불러오는 중이면 기본 선택으로는 살 수 없다', () => {
    expect(canPurchasePassSelection('loading', null)).toBe(false);
  });

  it('불러오는 중이어도 직접 고른 상품은 살 수 있다', () => {
    expect(canPurchasePassSelection('loading', 'fiveWeek')).toBe(true);
    expect(canPurchasePassSelection('loading', 'week')).toBe(true);
  });

  it('주차를 알면(시작일 없음 포함) 살 수 있다', () => {
    expect(canPurchasePassSelection(4, null)).toBe(true);
    expect(canPurchasePassSelection(null, null)).toBe(true);
  });
});

describe('selectPassOption', () => {
  const options = getPassOptions(sales, 1);

  it('아무것도 고르지 않았으면 추천 상품', () => {
    expect(selectPassOption(options, null)?.kind).toBe('fiveWeek');
    expect(selectPassOption(getPassOptions(sales, 4), null)?.kind).toBe('week');
  });

  it('고른 상품을 돌려준다', () => {
    expect(selectPassOption(options, 'week')?.kind).toBe('week');
  });

  it('고른 상품이 사라졌으면(1주 판매 종료) 남은 첫 상품', () => {
    const onlyFive = getPassOptions({ ...sales, weekPass: null }, 1);
    expect(selectPassOption(onlyFive, 'week')?.kind).toBe('fiveWeek');
  });

  it('상품이 없으면 null', () => {
    expect(selectPassOption([], 'fiveWeek')).toBeNull();
  });
});

describe('getPassCtaLabel', () => {
  const [fiveWeek, week] = getPassOptions(sales, 1);

  it('처음 사면 시작하기', () => {
    expect(getPassCtaLabel(fiveWeek, false)).toBe('1,900원으로 한 회차 시작하기');
    expect(getPassCtaLabel(week, false)).toBe('1,500원으로 1주 시작하기');
  });

  it('패스가 남아 있으면 연장하기', () => {
    expect(getPassCtaLabel(fiveWeek, true)).toBe('1,900원으로 5주 연장하기');
    expect(getPassCtaLabel(week, true)).toBe('1,500원으로 1주 연장하기');
  });
});

describe('getRepeatWeekNote', () => {
  const [fiveWeek, week] = getPassOptions(sales, 1);

  it('5주 패스만 한 주 더 하기 연장 안내 (최대 2번)', () => {
    expect(getRepeatWeekNote(fiveWeek)).toBe('한 주 더 하면 패스도 한 주 늘어나요 (최대 2번)');
    expect(getRepeatWeekNote(week)).toBeNull();
  });
});

describe('getPassRecipeLine', () => {
  it('패스 하루 한도를 설정값으로 보여준다', () => {
    expect(getPassRecipeLine(20)).toBe('레시피 하루 20개, 광고 없이');
    expect(getPassRecipeLine(30)).toBe('레시피 하루 30개, 광고 없이');
  });

  it('설정을 못 불러왔으면 null', () => {
    expect(getPassRecipeLine(undefined)).toBeNull();
  });
});
