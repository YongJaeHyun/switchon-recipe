import type { SalesState } from 'types/pass';
import { describe, expect, it } from 'vitest';
import {
  getDeleteAccountMessage,
  getPassBannerText,
  getPassRemainingDays,
  getVerifyResultToast,
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
    expect(getPassBannerText(freeSales)).toBe('지금 사면 61% 할인 · D-12');
  });

  it('무료 기간 early2 → 40% 할인', () => {
    expect(
      getPassBannerText({ ...freeSales, tier: 'early2', priceKrw: 2900, freeDaysLeft: 3 })
    ).toBe('지금 사면 40% 할인 · D-3');
  });

  it('무료 기간이 아니면 null', () => {
    expect(
      getPassBannerText({
        ...freeSales,
        freeActive: false,
        tier: 'regular',
        priceKrw: 4900,
        freeDaysLeft: 0,
      })
    ).toBeNull();
  });

  it('판매 중이 아니면 null', () => {
    expect(getPassBannerText({ ...freeSales, onSale: false })).toBeNull();
  });

  it('상태를 모르면 null', () => {
    expect(getPassBannerText(undefined)).toBeNull();
  });
});

describe('getVerifyResultToast', () => {
  it('granted → 성공', () => {
    expect(
      getVerifyResultToast({ status: 'granted', passExpiresAt: '2026-12-01T14:59:59Z' })
    ).toEqual({ type: 'success', textType: 'PASS_ACTIVATED' });
  });

  it('already_processed → 성공으로 취급', () => {
    expect(getVerifyResultToast({ status: 'already_processed', passExpiresAt: null })).toEqual({
      type: 'success',
      textType: 'PASS_ACTIVATED',
    });
  });

  it('price_changed → 가격 변경 오류', () => {
    expect(getVerifyResultToast({ status: 'price_changed' })).toEqual({
      type: 'error',
      textType: 'PASS_PRICE_CHANGED',
    });
  });

  it('invalid → 확인 실패 오류', () => {
    expect(getVerifyResultToast({ status: 'invalid' })).toEqual({
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
