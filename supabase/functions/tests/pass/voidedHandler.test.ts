import { describe, expect, it, vi } from 'vitest';
import type { VoidedPurchase } from '../../_shared/googlePlay.ts';
import { computeExpiry } from '../../_shared/pass.ts';
import { syncVoided, type VoidedDeps } from '../../sync-voided-purchases/handler.ts';

const SINCE = Date.UTC(2026, 9, 17); // now - 3d 역할의 임의 기준점

interface Row {
  purchaseToken: string;
  uid: string | null;
  status: string;
  purchasedAt: Date;
}

const voided = (overrides: Partial<VoidedPurchase> = {}): VoidedPurchase => ({
  purchaseToken: 'token-1',
  orderId: 'GPA.1234',
  voidedTimeMillis: String(Date.now()),
  ...overrides,
});

const createFakeDeps = (rows: Row[], voidedPurchases: VoidedPurchase[]) => {
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
        .map((r) => ({ purchasedAt: r.purchasedAt, status: r.status as 'granted' | 'voided' }))
    ),

    setPassExpiry: vi.fn(async (uid: string, expiresAt: Date | null) => {
      expiries.set(uid, expiresAt);
    }),
  };

  return { deps, rows, expiries };
};

describe('syncVoided', () => {
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

    const expected = computeExpiry([{ purchasedAt: p2, status: 'granted' }]);
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

  it('이미 voided인 토큰은 다시 처리하지 않는다', async () => {
    const rows: Row[] = [
      { purchaseToken: 't1', uid: 'u1', status: 'voided', purchasedAt: new Date() },
    ];
    const { deps } = createFakeDeps(rows, [voided({ purchaseToken: 't1' })]);

    const result = await syncVoided(deps, SINCE);

    expect(result).toEqual({ voided: 0, usersUpdated: 0 });
    expect(deps.markVoided).not.toHaveBeenCalled();
    expect(deps.setPassExpiry).not.toHaveBeenCalled();
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
