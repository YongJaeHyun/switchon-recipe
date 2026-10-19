import { describe, expect, it, vi } from 'vitest';
import type { ProductPurchase } from '../../_shared/googlePlay.ts';
import { computeExpiry, type PremiumSetting } from '../../_shared/pass.ts';
import {
  type PurchaseRow,
  type VerifyDeps,
  verifyPurchase,
} from '../../verify-pass-purchase/handler.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const UID = 'user-1';
const TOKEN = 'token-1';
const P1900 = 'switchon_pass_5w_1900';
const P4900 = 'switchon_pass_5w_4900';

// 무료 기간 2026-11-01 ~ 2026-11-14 (KST). 1주차 구간: 2026-10-31T15:00Z ~ 2026-11-07T15:00Z
const SETTING: PremiumSetting = { freeStart: '2026-11-01', freeEnd: '2026-11-14' };
const IN_EARLY1 = new Date('2026-11-02T03:00:00.000Z');
// 1주차 구간 종료 + 24시간 유예 (2026-11-08T15:00Z) 이후
const AFTER_GRACE = new Date('2026-11-10T00:00:00.000Z');

const purchase = (overrides: Partial<ProductPurchase> = {}): ProductPurchase => ({
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  purchaseTimeMillis: String(IN_EARLY1.getTime()),
  orderId: 'GPA.1234',
  obfuscatedExternalAccountId: UID,
  productId: P1900,
  ...overrides,
});

const createFakeDeps = (
  options: {
    playPurchase?: ProductPurchase;
    existing?: PurchaseRow[];
    insertResult?: 'inserted' | 'duplicate';
    consumeError?: Error;
    now?: Date;
  } = {}
) => {
  const rows: PurchaseRow[] = [...(options.existing ?? [])];
  const expiries = new Map<string, Date | null>();

  const play = {
    getProductPurchase: vi.fn(async () => options.playPurchase ?? purchase()),
    consumeProductPurchase: vi.fn(async () => {
      if (options.consumeError) throw options.consumeError;
    }),
    refundOrder: vi.fn(async () => {}),
  };

  const deps: VerifyDeps = {
    now: () => options.now ?? IN_EARLY1,
    getSetting: vi.fn(async () => SETTING),
    findPurchase: vi.fn(async (token: string) => {
      const row = rows.find((r) => r.purchaseToken === token);
      return row ? { status: row.status } : null;
    }),
    listUserPurchases: vi.fn(async (uid: string) =>
      rows
        .filter((r) => r.uid === uid)
        .map((r) => ({ purchasedAt: r.purchasedAt, status: r.status }))
    ),
    insertPurchase: vi.fn(async (row: PurchaseRow) => {
      if (options.insertResult === 'duplicate') return 'duplicate' as const;
      rows.push(row);
      return 'inserted' as const;
    }),
    setPassExpiry: vi.fn(async (uid: string, expiresAt: Date | null) => {
      expiries.set(uid, expiresAt);
    }),
    play,
  };

  return { deps, play, rows, expiries };
};

const existingRow = (overrides: Partial<PurchaseRow> = {}): PurchaseRow => ({
  uid: UID,
  productId: P1900,
  purchaseToken: 'old-token',
  orderId: 'GPA.0001',
  priceKrw: 1900,
  purchasedAt: new Date('2026-11-01T00:00:00.000Z'),
  grantedFrom: new Date('2026-11-01T00:00:00.000Z'),
  grantedUntil: new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 35 * DAY_MS),
  status: 'granted',
  raw: {},
  ...overrides,
});

const input = { uid: UID, productId: P1900, purchaseToken: TOKEN };

describe('verifyPurchase', () => {
  it('정상 구매면 패스를 주고 기록, 만료일 갱신, 소비한다', async () => {
    const { deps, play, rows, expiries } = createFakeDeps();

    const result = await verifyPurchase(deps, input);

    const expectedExpiry = new Date(IN_EARLY1.getTime() + 35 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });

    expect(deps.insertPurchase).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: UID,
      productId: P1900,
      purchaseToken: TOKEN,
      orderId: 'GPA.1234',
      priceKrw: 1900,
      purchasedAt: IN_EARLY1,
      grantedFrom: IN_EARLY1,
      grantedUntil: expectedExpiry,
      status: 'granted',
    });

    expect(expiries.get(UID)).toEqual(
      computeExpiry([{ purchasedAt: IN_EARLY1, status: 'granted' }])
    );
    expect(play.consumeProductPurchase).toHaveBeenCalledTimes(1);
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1900, TOKEN);
  });

  it('이미 처리된 토큰이면 Play 조회 없이 already_processed를 반환한다', async () => {
    const { deps, play } = createFakeDeps({
      existing: [existingRow({ purchaseToken: TOKEN, status: 'refunded_ineligible' })],
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'already_processed', passExpiresAt: null });
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
    expect(play.refundOrder).not.toHaveBeenCalled();
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('이미 granted로 처리된 토큰이면 Play 조회 없이 consume만 다시 시도한다', async () => {
    const row = existingRow({ purchaseToken: TOKEN });
    const { deps, play } = createFakeDeps({ existing: [row] });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({
      status: 'already_processed',
      passExpiresAt: (row.grantedUntil as Date).toISOString(),
    });
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1900, TOKEN);
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('insert가 duplicate(동시 요청)면 already_processed를 반환한다', async () => {
    const { deps } = createFakeDeps({ insertResult: 'duplicate' });

    const result = await verifyPurchase(deps, input);

    expect(result.status).toBe('already_processed');
    expect(deps.setPassExpiry).not.toHaveBeenCalled();
  });

  it('purchaseState가 0이 아니면 invalid, insert 없음', async () => {
    const { deps, play } = createFakeDeps({ playPurchase: purchase({ purchaseState: 2 }) });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.setPassExpiry).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('obfuscatedExternalAccountId가 uid와 다르면 invalid', async () => {
    const { deps, play } = createFakeDeps({
      playPurchase: purchase({ obfuscatedExternalAccountId: 'someone-else' }),
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('obfuscatedExternalAccountId가 없으면 invalid', async () => {
    const { deps } = createFakeDeps({
      playPurchase: purchase({ obfuscatedExternalAccountId: undefined }),
    });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('모르는 productId면 Play 호출 없이 invalid', async () => {
    const { deps, play } = createFakeDeps();

    const result = await verifyPurchase(deps, { ...input, productId: 'unknown_product' });

    expect(result).toEqual({ status: 'invalid' });
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
    expect(play.refundOrder).not.toHaveBeenCalled();
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('유예 밖의 1900 구매는 환불하고 refunded_ineligible로 기록, price_changed', async () => {
    const { deps, play, rows } = createFakeDeps({
      now: AFTER_GRACE,
      playPurchase: purchase({ purchaseTimeMillis: String(AFTER_GRACE.getTime()) }),
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'price_changed' });
    expect(play.refundOrder).toHaveBeenCalledWith('GPA.1234');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'refunded_ineligible',
      purchaseToken: TOKEN,
      grantedFrom: null,
      grantedUntil: null,
    });
    expect(deps.setPassExpiry).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('유예 밖인데 orderId가 없으면 환불 호출 없이 기록하고 price_changed', async () => {
    const { deps, play, rows } = createFakeDeps({
      now: AFTER_GRACE,
      playPurchase: purchase({
        purchaseTimeMillis: String(AFTER_GRACE.getTime()),
        orderId: undefined,
      }),
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'price_changed' });
    expect(play.refundOrder).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: 'refunded_ineligible', orderId: null });
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('패스가 남아 있을 때 재구매하면 만료일이 이어 붙는다', async () => {
    const previous = existingRow();
    const previousExpiry = previous.grantedUntil as Date; // 2026-12-06T00:00Z
    const { deps, rows, expiries } = createFakeDeps({
      existing: [previous],
      playPurchase: purchase({ productId: P4900 }),
    });

    const result = await verifyPurchase(deps, { ...input, productId: P4900 });

    const expectedExpiry = new Date(previousExpiry.getTime() + 35 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });
    expect(expiries.get(UID)).toEqual(expectedExpiry);
    const inserted = rows.find((r) => r.purchaseToken === TOKEN);
    expect(inserted).toMatchObject({
      priceKrw: 4900,
      grantedFrom: previousExpiry,
      grantedUntil: expectedExpiry,
    });
  });

  it('consume이 실패해도 granted를 유지하고 오류를 로그한다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, expiries } = createFakeDeps({ consumeError: new Error('consume failed') });

    const result = await verifyPurchase(deps, input);

    expect(result.status).toBe('granted');
    expect(expiries.get(UID)).toEqual(new Date(IN_EARLY1.getTime() + 35 * DAY_MS));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('Play 응답의 productId가 요청과 다르면 invalid', async () => {
    const { deps } = createFakeDeps({ playPurchase: purchase({ productId: P4900 }) });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });
});
