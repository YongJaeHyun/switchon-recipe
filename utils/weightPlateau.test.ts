import { describe, expect, it } from 'vitest';
import type { PassStatus } from 'types/pass';
import {
  PLATEAU_MIN_DAYS,
  findWeightPlateau,
  isPlateauDismissed,
  plateauCta,
  plateauTitle,
} from './weightPlateau';

const log = (day: string, weight_kg: number) => ({ day, weight_kg });
const base = { startDate: '2026-10-20', programStart: '2026-10-20', today: '2026-10-31' };

describe('findWeightPlateau', () => {
  it('최근 3일 연속 기록이 0.2kg 이내면 정체', () => {
    const logs = [log('2026-10-29', 65.1), log('2026-10-30', 65.3), log('2026-10-31', 65.2)];
    expect(findWeightPlateau(logs, base)).toEqual({
      days: 3,
      from: '2026-10-29',
      to: '2026-10-31',
    });
  });

  it('기록 순서와 상관없이 날짜순으로 본다', () => {
    const logs = [log('2026-10-31', 65.2), log('2026-10-29', 65.1), log('2026-10-30', 65.3)];
    expect(findWeightPlateau(logs, base)?.days).toBe(3);
  });

  it('기록이 3개보다 적으면 아님', () => {
    expect(findWeightPlateau([], base)).toBeNull();
    expect(findWeightPlateau([log('2026-10-30', 65), log('2026-10-31', 65)], base)).toBeNull();
  });

  it('하루라도 비면 연속이 끊긴다', () => {
    const logs = [log('2026-10-28', 65.0), log('2026-10-30', 65.0), log('2026-10-31', 65.0)];
    expect(findWeightPlateau(logs, base)).toBeNull();
  });

  it('끊긴 앞쪽은 빼고 최근 연속 구간만 센다', () => {
    const logs = [
      log('2026-10-25', 65.0),
      log('2026-10-26', 65.0),
      log('2026-10-28', 65.0),
      log('2026-10-29', 65.0),
      log('2026-10-30', 65.0),
      log('2026-10-31', 65.0),
    ];
    expect(findWeightPlateau(logs, base)).toEqual({
      days: 4,
      from: '2026-10-28',
      to: '2026-10-31',
    });
  });

  it('최대·최소 차이가 0.2kg을 넘는 곳에서 멈춘다', () => {
    const logs = [
      log('2026-10-27', 66.0),
      log('2026-10-28', 65.4),
      log('2026-10-29', 65.2),
      log('2026-10-30', 65.3),
      log('2026-10-31', 65.4),
    ];
    // 10-28(65.4)까지는 65.2~65.4로 0.2 이내, 10-27(66.0)에서 넘는다
    expect(findWeightPlateau(logs, base)).toEqual({
      days: 4,
      from: '2026-10-28',
      to: '2026-10-31',
    });
  });

  it('차이가 0.2kg을 넘으면 아님', () => {
    const logs = [log('2026-10-29', 65.0), log('2026-10-30', 65.3), log('2026-10-31', 65.1)];
    expect(findWeightPlateau(logs, base)).toBeNull();
  });

  it('부동소수 오차로 0.2kg이 0.2000…1이 되어도 정체로 본다', () => {
    // 65.3 - 65.1 = 0.19999…, 0.3 - 0.1류 오차 양쪽 모두
    const logs = [log('2026-10-29', 65.1), log('2026-10-30', 65.3), log('2026-10-31', 65.1)];
    expect(findWeightPlateau(logs, base)?.days).toBe(3);
    const logs2 = [log('2026-10-29', 70.7), log('2026-10-30', 70.9), log('2026-10-31', 70.8)];
    expect(findWeightPlateau(logs2, base)?.days).toBe(3);
  });

  it('문자열로 온 체중도 숫자로 본다', () => {
    const logs = [
      { day: '2026-10-29', weight_kg: '65.1' as unknown as number },
      { day: '2026-10-30', weight_kg: '65.2' as unknown as number },
      { day: '2026-10-31', weight_kg: '65.1' as unknown as number },
    ];
    expect(findWeightPlateau(logs, base)?.days).toBe(3);
  });

  it('회차 시작일 이전 기록은 세지 않는다', () => {
    const logs = [log('2026-10-28', 65.0), log('2026-10-29', 65.0), log('2026-10-30', 65.0)];
    expect(
      findWeightPlateau(logs, { startDate: '2026-10-29', programStart: null, today: '2026-10-30' })
    ).toBeNull();
  });

  it('한 주 더 하기로 시작일이 미뤄져도 회차 시작일부터 센다', () => {
    const logs = [log('2026-10-28', 65.0), log('2026-10-29', 65.0), log('2026-10-30', 65.0)];
    expect(
      findWeightPlateau(logs, {
        startDate: '2026-10-29',
        programStart: '2026-10-20',
        today: '2026-10-30',
      })?.days
    ).toBe(3);
  });

  it('마지막 기록이 어제면 보여주고, 그보다 오래됐으면 지난 일이라 안 보여준다', () => {
    const logs = [log('2026-10-28', 65.0), log('2026-10-29', 65.0), log('2026-10-30', 65.0)];
    expect(findWeightPlateau(logs, base)?.days).toBe(3);
    expect(findWeightPlateau(logs, { ...base, today: '2026-11-01' })).toBeNull();
  });

  it('시작일을 모르면 아님', () => {
    const logs = [log('2026-10-29', 65), log('2026-10-30', 65), log('2026-10-31', 65)];
    expect(findWeightPlateau(logs, { ...base, startDate: null, programStart: null })).toBeNull();
  });

  it('최소 일수는 3일', () => {
    expect(PLATEAU_MIN_DAYS).toBe(3);
  });
});

describe('plateauTitle', () => {
  it('며칠째인지 보여준다', () => {
    expect(plateauTitle(3)).toBe('체중이 3일째 그대로예요');
    expect(plateauTitle(5)).toBe('체중이 5일째 그대로예요');
  });
});

describe('isPlateauDismissed', () => {
  it('오늘 닫았으면 숨긴다', () => {
    expect(isPlateauDismissed('2026-10-31', '2026-10-31')).toBe(true);
  });
  it('어제 닫았거나 닫은 적 없으면 보인다', () => {
    expect(isPlateauDismissed('2026-10-30', '2026-10-31')).toBe(false);
    expect(isPlateauDismissed(null, '2026-10-31')).toBe(false);
  });
});

const status = (o: Partial<PassStatus> = {}, onSale = true): PassStatus => ({
  sales: {
    onSale,
    freeActive: false,
    tier: onSale ? 'regular' : null,
    productId: onSale ? 'switchon_pass_5w_4900' : null,
    priceKrw: onSale ? 4900 : null,
    freeDaysLeft: 0,
    nextTier: null,
  },
  passExpiresAt: null,
  hasAccess: false,
  serverNow: '2026-10-31T00:00:00Z',
  ...o,
});

describe('plateauCta', () => {
  const report = { start_date: '2026-10-20', week_index: 1 };

  it('패스 사용자는 최신 리포트로', () => {
    expect(plateauCta(status({ hasAccess: true }), true, report)).toEqual({
      kind: 'report',
      href: '/report/2026-10-20/1',
    });
  });

  it('패스 사용자인데 리포트가 아직 없으면 리포트 칸으로', () => {
    expect(plateauCta(status({ hasAccess: true }), true, null)).toEqual({ kind: 'reports' });
  });

  it('패스가 없고 판매 중이면 패스 화면으로', () => {
    expect(plateauCta(status(), true, report)).toEqual({ kind: 'pass' });
  });

  it('판매 중이 아니거나 결제를 못 쓰면 버튼을 숨긴다', () => {
    expect(plateauCta(status({}, false), true, report)).toBeNull();
    expect(plateauCta(status(), false, report)).toBeNull();
    expect(plateauCta(status(), undefined, report)).toBeNull();
  });

  it('상태를 모르면 숨긴다', () => {
    expect(plateauCta(undefined, true, report)).toBeNull();
  });
});
