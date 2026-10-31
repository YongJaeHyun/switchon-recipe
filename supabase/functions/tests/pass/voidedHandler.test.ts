import { describe, expect, it, vi } from 'vitest';
import type { VoidedPurchase } from '../../_shared/googlePlay.ts';
import { computeExpiry } from '../../_shared/pass.ts';
import { syncVoided, type VoidedDeps } from '../../sync-voided-purchases/handler.ts';

const SINCE = Date.UTC(2026, 9, 17); // now - 7d 역할의 임의 기준점

interface Row {
  purchaseToken: string;
  uid: string | null;
  status: string;
  purchasedAt: Date;
  productId?: string; // 기본 5주 정가
}

const voided = (overrides: Partial<VoidedPurchase> = {}): VoidedPurchase => ({
  purchaseToken: 'token-1',
  orderId: 'GPA.1234',
  voidedTimeMillis: String(Date.now()),
  ...overrides,
});

const createFakeDeps = (
  rows: Row[],
  voidedPurchases: VoidedPurchase[],
  extensions: { uid: string; extendedAt: Date }[] = []
) => {
  const expiries = new Map<string, Date | null>();

  const deps: VoidedDeps = {
    listVoided: vi.fn(async (_sinceMillis: number) => voidedPurchases),

    findPurchasesByTokens: vi.fn(async (tokens: string[]) =>
      rows
        .filter((r) => tokens.includes(r.purchaseToken))
        .map((r) => ({ purchaseToken: r.purchaseToken, uid: r.uid, status: r.status }))
    ),

    markVoided: vi.fn(async (tokens: string[]) => {
      rows.forEach((r) => {
        if (tokens.includes(r.purchaseToken)) r.status = 'voided';
      });
    }),

    listUserPurchases: vi.fn(async (uid: string) =>
      rows
        .filter((r) => r.uid === uid)
        .map((r) => ({
          productId: r.productId ?? 'switchon_pass_5w_4900',
          purchasedAt: r.purchasedAt,
          status: r.status as 'granted' | 'voided',
        }))
    ),

    listUserExtensions: vi.fn(async (uid: string) =>
      extensions.filter((e) => e.uid === uid).map((e) => ({ extendedAt: e.extendedAt }))
    ),

    setPassExpiry: vi.fn(async (uid: string, expiresAt: Date | null) => {
      expiries.set(uid, expiresAt);
    }),
  };

  return { deps, rows, expiries };
};

describe('syncVoided: 한 주 더 하기 연장', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const p1 = new Date('2026-11-01T00:00:00.000Z');

  it('다른 구매가 환불돼도 남은 패스 기간 안의 연장 7일은 그대로 둔다', async () => {
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 },
      {
        purchaseToken: 't2',
        uid: 'u1',
        status: 'granted',
        purchasedAt: new Date('2026-11-25T00:00:00.000Z'),
        productId: 'switchon_pass_1w_1500',
      },
    ];
    const { deps, expiries } = createFakeDeps(
      rows,
      [voided({ purchaseToken: 't2' })],
      [{ uid: 'u1', extendedAt: new Date('2026-11-20T00:00:00.000Z') }]
    );

    await syncVoided(deps, SINCE);

    expect(expiries.get('u1')).toEqual(new Date(p1.getTime() + 42 * DAY));
  });

  it('연장의 바탕이 된 구매가 환불되면 연장도 없어진다', async () => {
    const rows: Row[] = [{ purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 }];
    const { deps, expiries } = createFakeDeps(
      rows,
      [voided({ purchaseToken: 't1' })],
      [{ uid: 'u1', extendedAt: new Date('2026-11-20T00:00:00.000Z') }]
    );

    await syncVoided(deps, SINCE);

    expect(expiries.get('u1')).toBeNull();
  });
});

describe('syncVoided', () => {
  it('1주 패스가 환불되면 그 7일만 빠진다 (5주 패스는 35일 그대로)', async () => {
    const p1 = new Date('2026-11-01T00:00:00.000Z');
    const p2 = new Date('2026-11-10T00:00:00.000Z');
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 },
      {
        purchaseToken: 't2',
        uid: 'u1',
        status: 'granted',
        purchasedAt: p2,
        productId: 'switchon_pass_1w_1500',
      },
    ];
    const { deps, expiries } = createFakeDeps(rows, [voided({ purchaseToken: 't2' })]);

    await syncVoided(deps, SINCE);

    expect(expiries.get('u1')).toEqual(new Date(p1.getTime() + 35 * 24 * 60 * 60 * 1000));
  });

  it('5주 패스가 환불되고 1주 패스만 남으면 1주 패스 구매 시각 + 7일', async () => {
    const p1 = new Date('2026-11-01T00:00:00.000Z');
    const p2 = new Date('2026-11-10T00:00:00.000Z');
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 },
      {
        purchaseToken: 't2',
        uid: 'u1',
        status: 'granted',
        purchasedAt: p2,
        productId: 'switchon_pass_1w_1500',
      },
    ];
    const { deps, expiries } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    await syncVoided(deps, SINCE);

    expect(expiries.get('u1')).toEqual(new Date(p2.getTime() + 7 * 24 * 60 * 60 * 1000));
  });

  it('환불된 granted 구매는 voided로 표시하고 유저 만료일을 재계산한다', async () => {
    const purchasedAt = new Date('2026-10-01T00:00:00.000Z');
    const rows: Row[] = [{ purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt }];
    const {
      deps,
      rows: stored,
      expiries,
    } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 1, usersUpdated: 1 });
    expect(deps.markVoided).toHaveBeenCalledWith(['t1']);
    expect(stored[0].status).toBe('voided');
    expect(expiries.get('u1')).toBeNull();
    expect(deps.listVoided).toHaveBeenCalledWith(SINCE);
  });

  it('겹친 패스 중 하나만 환불되면 남은 구매 기준으로 만료일을 다시 계산한다', async () => {
    const p1 = new Date('2026-10-01T00:00:00.000Z');
    const p2 = new Date('2026-10-05T00:00:00.000Z');
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 },
      { purchaseToken: 't2', uid: 'u1', status: 'granted', purchasedAt: p2 },
    ];
    const { deps, expiries } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    const expected = computeExpiry([
      { productId: 'switchon_pass_5w_4900', purchasedAt: p2, status: 'granted' },
    ]);
    expect(result).toEqual({ voided: 1, usersUpdated: 1 });
    expect(expiries.get('u1')).toEqual(expected);
  });

  it('모르는 토큰은 무시한다', async () => {
    const rows: Row[] = [];
    const { deps } = createFakeDeps(rows, [voided({ purchaseToken: 'unknown-token' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 0, usersUpdated: 0 });
    expect(deps.markVoided).not.toHaveBeenCalled();
  });

  it('이미 voided인 토큰은 다시 마킹하지 않는다', async () => {
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'voided', purchasedAt: new Date() },
    ];
    const { deps } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result.voided).toBe(0);
    expect(deps.markVoided).not.toHaveBeenCalled();
  });

  it('이미 voided로 처리된 토큰이 다시 보고돼도 유저의 저장된 만료일을 남은 granted 구매 기준으로 다시 맞춘다', async () => {
    // 이전 실행에서 부분 실패했거나 verify-pass-purchase와 레이스가 나서 저장된 만료일이
    // t1까지 포함한 값으로 틀어져 있다고 가정. 이번 재실행에서도 t1은 여전히 voided로 보고된다.
    const p1 = new Date('2026-10-01T00:00:00.000Z');
    const p2 = new Date('2026-10-05T00:00:00.000Z');
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'voided', purchasedAt: p1 },
      { purchaseToken: 't2', uid: 'u1', status: 'granted', purchasedAt: p2 },
    ];
    const { deps, expiries } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    const expected = computeExpiry([
      { productId: 'switchon_pass_5w_4900', purchasedAt: p2, status: 'granted' },
    ]);
    expect(result).toEqual({ voided: 0, usersUpdated: 1 });
    expect(deps.markVoided).not.toHaveBeenCalled();
    expect(deps.setPassExpiry).toHaveBeenCalledWith('u1', expected);
    expect(expiries.get('u1')).toEqual(expected);
  });

  it('refunded_ineligible 구매는 voided로 바꾸지 않지만 해당 유저는 다시 계산된다', async () => {
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'refunded_ineligible', purchasedAt: new Date() },
    ];
    const {
      deps,
      rows: stored,
      expiries,
    } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 0, usersUpdated: 1 });
    expect(deps.markVoided).not.toHaveBeenCalled();
    expect(stored[0].status).toBe('refunded_ineligible');
    expect(expiries.get('u1')).toBeNull(); // refunded_ineligible은 granted가 아니므로 만료일에 기여하지 않음
  });

  it('uid가 null(탈퇴)이면 voided 표시만 하고 만료일은 재계산하지 않는다', async () => {
    const rows: Row[] = [
      { purchaseToken: 't1', uid: null, status: 'granted', purchasedAt: new Date() },
    ];
    const { deps, rows: stored } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 1, usersUpdated: 0 });
    expect(stored[0].status).toBe('voided');
    expect(deps.listUserPurchases).not.toHaveBeenCalled();
    expect(deps.setPassExpiry).not.toHaveBeenCalled();
  });

  it('패스가 모두 환불되면 setPassExpiry(uid, null)을 호출한다', async () => {
    const p1 = new Date('2026-10-01T00:00:00.000Z');
    const p2 = new Date('2026-10-03T00:00:00.000Z');
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'granted', purchasedAt: p1 },
      { purchaseToken: 't2', uid: 'u1', status: 'granted', purchasedAt: p2 },
    ];
    const { deps, expiries } = createFakeDeps(rows, [
      voided({ purchaseToken: 't1' }),
      voided({ purchaseToken: 't2', orderId: 'GPA.5678' }),
    ]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 2, usersUpdated: 1 });
    expect(deps.setPassExpiry).toHaveBeenCalledWith('u1', null);
    expect(expiries.get('u1')).toBeNull();
  });

  it('무효화 구매가 없으면 아무것도 하지 않는다', async () => {
    const { deps } = createFakeDeps([], []);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 0, usersUpdated: 0 });
    expect(deps.findPurchasesByTokens).not.toHaveBeenCalled();
    expect(deps.markVoided).not.toHaveBeenCalled();
  });
});
