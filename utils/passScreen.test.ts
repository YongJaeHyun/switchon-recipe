import type { PassStatus, SalesState } from 'types/pass';
import { describe, expect, it } from 'vitest';
import {
  getDeleteAccountMessage,
  getPassBannerText,
  getPassRemainingDays,
  getVerifyResultToast,
  isPassOnSale,
  shouldShowPremiumEntry,
} from './passScreen';

const freeSales: SalesState = {
  onSale: true,
  freeActive: true,
  tier: 'early1',
  productId: 'switchon_pass_5w_1900',
  priceKrw: 1900,
  freeDaysLeft: 12,
  nextTier: { tier: 'early2', priceKrw: 2900, startsAt: '2026-11-07T15:00:00.000Z' },
};

describe('getPassBannerText', () => {
  it('무료 기간 early1 → 61% 할인 · D-N', () => {
    expect(getPassBannerText(freeSales, true)).toBe('지금 사면 61% 할인 · D-12');
  });

  it('무료 기간 early2 → 40% 할인', () => {
    expect(
      getPassBannerText({ ...freeSales, tier: 'early2', priceKrw: 2900, freeDaysLeft: 3 }, true)
    ).toBe('지금 사면 40% 할인 · D-3');
  });

  it('무료 기간이 아니면 null', () => {
    expect(
      getPassBannerText(
        {
          ...freeSales,
          freeActive: false,
          tier: 'regular',
          priceKrw: 4900,
          freeDaysLeft: 0,
        },
        true
      )
    ).toBeNull();
  });

  it('판매 중이 아니면 null', () => {
    expect(getPassBannerText({ ...freeSales, onSale: false }, true)).toBeNull();
  });

  it('상태를 모르면 null', () => {
    expect(getPassBannerText(undefined, true)).toBeNull();
  });

  it('이 빌드에서 결제를 쓸 수 없으면 null', () => {
    expect(getPassBannerText(freeSales, false)).toBeNull();
  });

  it('결제 가능 여부를 아직 모르면 null', () => {
    expect(getPassBannerText(freeSales, undefined)).toBeNull();
  });
});

describe('isPassOnSale', () => {
  it('판매 중이고 결제를 쓸 수 있으면 true', () => {
    expect(isPassOnSale(freeSales, true)).toBe(true);
  });

  it('결제를 쓸 수 없는 빌드면 판매 중이어도 false', () => {
    expect(isPassOnSale(freeSales, false)).toBe(false);
  });

  it('결제 가능 여부를 아직 모르면 false', () => {
    expect(isPassOnSale(freeSales, undefined)).toBe(false);
  });

  it('판매 중이 아니거나 상태를 모르면 false', () => {
    expect(isPassOnSale({ ...freeSales, onSale: false }, true)).toBe(false);
    expect(isPassOnSale(undefined, true)).toBe(false);
  });
});

describe('getVerifyResultToast', () => {
  const NOW = new Date('2026-11-19T03:00:00Z');

  it('granted → 성공', () => {
    expect(
      getVerifyResultToast({ status: 'granted', passExpiresAt: '2026-12-01T14:59:59Z' }, NOW)
    ).toEqual({ type: 'success', textType: 'PASS_ACTIVATED' });
  });

  it('already_processed + 만료일이 미래 → 성공으로 취급', () => {
    expect(
      getVerifyResultToast(
        { status: 'already_processed', passExpiresAt: '2026-12-01T14:59:59Z' },
        NOW
      )
    ).toEqual({ type: 'success', textType: 'PASS_ACTIVATED' });
  });

  it('already_processed + 만료일 없음(환불된 구매 등) → 성공 아님', () => {
    expect(getVerifyResultToast({ status: 'already_processed', passExpiresAt: null }, NOW)).toEqual(
      { type: 'error', textType: 'PASS_ALREADY_PROCESSED' }
    );
  });

  it('already_processed + 만료일이 지남 → 성공 아님', () => {
    expect(
      getVerifyResultToast(
        { status: 'already_processed', passExpiresAt: '2026-11-19T02:59:59Z' },
        NOW
      )
    ).toEqual({ type: 'error', textType: 'PASS_ALREADY_PROCESSED' });
  });

  it('price_changed → 가격 변경 오류', () => {
    expect(getVerifyResultToast({ status: 'price_changed' }, NOW)).toEqual({
      type: 'error',
      textType: 'PASS_PRICE_CHANGED',
    });
  });

  it('invalid → 확인 실패 오류', () => {
    expect(getVerifyResultToast({ status: 'invalid' }, NOW)).toEqual({
      type: 'error',
      textType: 'PASS_INVALID',
    });
  });
});

describe('getPassRemainingDays', () => {
  it('KST 날짜 차이', () => {
    expect(getPassRemainingDays('2026-12-01T14:59:59Z', new Date('2026-11-19T03:00:00Z'))).toBe(12);
  });

  it('만료 당일은 1일', () => {
    expect(getPassRemainingDays('2026-12-01T14:59:59Z', new Date('2026-12-01T05:00:00Z'))).toBe(1);
  });

  it('만료됐거나 패스가 없으면 null', () => {
    expect(
      getPassRemainingDays('2026-12-01T14:59:59Z', new Date('2026-12-01T15:00:00Z'))
    ).toBeNull();
    expect(getPassRemainingDays(null, new Date('2026-11-19T03:00:00Z'))).toBeNull();
  });
});

describe('getDeleteAccountMessage', () => {
  const base = '탈퇴 시 모든 데이터가 삭제되며, 다시 복구할 수 없어요.';

  it('패스가 남아 있으면 경고 추가', () => {
    expect(getDeleteAccountMessage(base, 12)).toBe(
      `${base}\n남은 패스 기간(12일)도 함께 사라져요.`
    );
  });

  it('패스가 없으면 그대로', () => {
    expect(getDeleteAccountMessage(base, null)).toBe(base);
  });
});

describe('shouldShowPremiumEntry', () => {
  const status = (onSale: boolean, hasAccess: boolean): PassStatus => ({
    sales: { ...freeSales, onSale },
    passExpiresAt: null,
    hasAccess,
    serverNow: '2026-10-20T00:00:00.000Z',
  });

  it('상태를 모르면 숨긴다', () => {
    expect(shouldShowPremiumEntry(undefined, true)).toBe(false);
  });

  it('권한이 있으면 판매 여부·결제 가능 여부와 상관없이 보인다', () => {
    expect(shouldShowPremiumEntry(status(false, true), false)).toBe(true);
    expect(shouldShowPremiumEntry(status(false, true), undefined)).toBe(true);
  });

  it('권한이 없어도 판매 중이고 결제 가능하면 보인다', () => {
    expect(shouldShowPremiumEntry(status(true, false), true)).toBe(true);
  });

  it('권한이 없고 판매 중이 아니면 숨긴다', () => {
    expect(shouldShowPremiumEntry(status(false, false), true)).toBe(false);
  });

  it('권한이 없고 이 빌드에서 결제를 못 쓰면 숨긴다', () => {
    expect(shouldShowPremiumEntry(status(true, false), false)).toBe(false);
    expect(shouldShowPremiumEntry(status(true, false), undefined)).toBe(false);
  });
});
