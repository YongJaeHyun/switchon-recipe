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
const P1W = 'switchon_pass_1w_1500';

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
    raiseError?: Error; // 첫 raisePassExpiry 호출만 실패
    storedExpiry?: Date; // user_pass에 이미 저장된 만료일
    now?: Date;
    extensions?: { extendedAt: Date; purchaseToken: string }[]; // pass_extension 행
  } = {}
) => {
  const rows: PurchaseRow[] = [...(options.existing ?? [])];
  const expiries = new Map<string, Date>();
  if (options.storedExpiry) expiries.set(UID, options.storedExpiry);
  let raiseError = options.raiseError;

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
      return row ? { status: row.status, uid: row.uid } : null;
    }),
    listUserPurchases: vi.fn(async (uid: string) =>
      rows
        .filter((r) => r.uid === uid)
        .map((r) => ({
          purchaseToken: r.purchaseToken,
          productId: r.productId,
          purchasedAt: r.purchasedAt,
          status: r.status,
        }))
    ),
    listUserExtensions: vi.fn(async (_uid: string) =>
      (options.extensions ?? []).map((e) => ({ ...e }))
    ),
    insertPurchase: vi.fn(async (row: PurchaseRow) => {
      if (options.insertResult === 'duplicate') return 'duplicate' as const;
      rows.push(row);
      return 'inserted' as const;
    }),
    // DB의 raise_pass_expiry처럼 greatest(기존, 새 값)만 저장한다
    raisePassExpiry: vi.fn(async (uid: string, expiresAt: Date) => {
      if (raiseError) {
        const error = raiseError;
        raiseError = undefined;
        throw error;
      }
      const current = expiries.get(uid);
      const next = current && current.getTime() > expiresAt.getTime() ? current : expiresAt;
      expiries.set(uid, next);
      return next;
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

describe('verifyPurchase: 1주 패스', () => {
  const weekInput = { uid: UID, productId: P1W, purchaseToken: TOKEN };

  it('1주 패스는 7일, 1,500원으로 기록하고 소비한다', async () => {
    const { deps, play, rows } = createFakeDeps({ playPurchase: purchase({ productId: P1W }) });

    const result = await verifyPurchase(deps, weekInput);

    const expectedExpiry = new Date(IN_EARLY1.getTime() + 7 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });
    expect(rows[0]).toMatchObject({
      productId: P1W,
      priceKrw: 1500,
      grantedFrom: IN_EARLY1,
      grantedUntil: expectedExpiry,
      status: 'granted',
    });
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1W, TOKEN);
    expect(play.refundOrder).not.toHaveBeenCalled();
  });

  it('5주 패스가 남아 있으면 그 만료일 뒤에 7일을 이어 붙인다', async () => {
    const old = existingRow(); // 11/1 + 35일
    const { deps, rows } = createFakeDeps({
      existing: [old],
      playPurchase: purchase({ productId: P1W }),
    });

    const result = await verifyPurchase(deps, weekInput);

    const oldUntil = old.grantedUntil as Date;
    const expectedExpiry = new Date(oldUntil.getTime() + 7 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });
    expect(rows[1]).toMatchObject({ grantedFrom: oldUntil, grantedUntil: expectedExpiry });
  });

  it('1주 패스가 남아 있을 때 5주 패스를 사면 7일 뒤에 35일', async () => {
    const weekRow = existingRow({
      productId: P1W,
      priceKrw: 1500,
      grantedUntil: new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 7 * DAY_MS),
    });
    const { deps } = createFakeDeps({ existing: [weekRow] });

    const result = await verifyPurchase(deps, input);

    const expectedExpiry = new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 42 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });
  });

  it('1주 패스는 가격 구간이 없어 무료 기간이 지나도 환불하지 않는다', async () => {
    const { deps, play } = createFakeDeps({
      playPurchase: purchase({ productId: P1W, purchaseTimeMillis: String(AFTER_GRACE.getTime()) }),
      now: AFTER_GRACE,
    });

    expect((await verifyPurchase(deps, weekInput)).status).toBe('granted');
    expect(play.refundOrder).not.toHaveBeenCalled();
  });
});

describe('verifyPurchase: 한 주 더 하기 연장', () => {
  const p1 = new Date('2026-11-01T00:00:00.000Z');
  const extendedAt = new Date('2026-11-20T00:00:00.000Z');
  const later = new Date('2026-11-25T00:00:00.000Z');

  it('연장된 패스 중 새로 사면 연장분 뒤에 이어 붙인다 (연장 7일이 사라지지 않음)', async () => {
    const { deps, rows } = createFakeDeps({
      existing: [existingRow({ purchasedAt: p1 })],
      extensions: [{ extendedAt, purchaseToken: 'old-token' }],
      storedExpiry: new Date(p1.getTime() + 42 * DAY_MS), // DB 함수가 이미 +7일
      playPurchase: purchase({ productId: P4900, purchaseTimeMillis: String(later.getTime()) }),
      now: later,
    });

    const result = await verifyPurchase(deps, { ...input, productId: P4900 });

    const expected = new Date(p1.getTime() + 77 * DAY_MS);
    expect(result).toEqual({ status: 'granted', passExpiresAt: expected.toISOString() });
    expect(rows[1]).toMatchObject({
      grantedFrom: new Date(p1.getTime() + 42 * DAY_MS),
      grantedUntil: expected,
    });
    expect(deps.listUserExtensions).toHaveBeenCalledWith(UID);
  });

  it('already_processed 복구도 연장을 반영한 만료일로 맞춘다', async () => {
    const { deps } = createFakeDeps({
      existing: [existingRow({ purchaseToken: TOKEN, purchasedAt: p1 })],
      extensions: [{ extendedAt, purchaseToken: TOKEN }],
    });

    expect(await verifyPurchase(deps, input)).toEqual({
      status: 'already_processed',
      passExpiresAt: new Date(p1.getTime() + 42 * DAY_MS).toISOString(),
    });
  });

  it('구매 하나에 묶인 연장은 2번까지만, 1주 패스에 묶인 연장은 반영하지 않는다', async () => {
    const week = existingRow({
      purchaseToken: 'week-token',
      productId: P1W,
      purchasedAt: new Date('2026-11-02T00:00:00.000Z'),
    });
    const { deps } = createFakeDeps({
      existing: [existingRow({ purchaseToken: TOKEN, purchasedAt: p1 }), week],
      extensions: [
        { extendedAt: new Date('2026-11-08T00:00:00.000Z'), purchaseToken: TOKEN },
        { extendedAt: new Date('2026-11-15T00:00:00.000Z'), purchaseToken: TOKEN },
        { extendedAt: new Date('2026-11-22T00:00:00.000Z'), purchaseToken: TOKEN },
        { extendedAt: new Date('2026-11-29T00:00:00.000Z'), purchaseToken: 'week-token' },
      ],
    });

    // 35 + 7(1주) + 연장 2번
    expect(await verifyPurchase(deps, input)).toEqual({
      status: 'already_processed',
      passExpiresAt: new Date(p1.getTime() + 56 * DAY_MS).toISOString(),
    });
  });
});

describe('verifyPurchase: Play 응답의 상품', () => {
  it('Play 응답에 productId가 없으면 invalid (요청한 상품과 같은지 확인할 수 없음)', async () => {
    const { deps, rows } = createFakeDeps({ playPurchase: purchase({ productId: undefined }) });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(rows).toHaveLength(0);
  });

  it('Play 응답의 productId가 요청과 다르면 invalid', async () => {
    const { deps } = createFakeDeps({ playPurchase: purchase({ productId: P1W }) });
    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
  });
});

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
      computeExpiry([{ productId: P1900, purchasedAt: IN_EARLY1, status: 'granted' }])
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
    expect(deps.raisePassExpiry).toHaveBeenCalledWith(UID, row.grantedUntil);
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1900, TOKEN);
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('다른 유저가 이미 처리한 granted 토큰이면 invalid, 그 유저 만료일을 동기화하지 않고 consume만 재시도', async () => {
    const row = existingRow({ purchaseToken: TOKEN, uid: 'someone-else' });
    const { deps, play, expiries } = createFakeDeps({ existing: [row] });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'invalid' });
    expect(deps.listUserPurchases).not.toHaveBeenCalled();
    expect(deps.raisePassExpiry).not.toHaveBeenCalled();
    expect(expiries.size).toBe(0);
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1900, TOKEN);
    expect(deps.insertPurchase).not.toHaveBeenCalled();
  });

  it('다른 유저(또는 탈퇴로 uid null)의 refunded 토큰이면 invalid, consume 안 함', async () => {
    const row = existingRow({
      purchaseToken: TOKEN,
      uid: null as unknown as string,
      status: 'refunded_ineligible',
    });
    const { deps, play } = createFakeDeps({ existing: [row] });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(deps.raisePassExpiry).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('insert가 duplicate(동시 요청)면 already_processed를 반환한다', async () => {
    const { deps } = createFakeDeps({ insertResult: 'duplicate' });

    const result = await verifyPurchase(deps, input);

    expect(result.status).toBe('already_processed');
  });

  it('purchaseState가 0이 아니면 invalid, insert 없음', async () => {
    const { deps, play } = createFakeDeps({ playPurchase: purchase({ purchaseState: 2 }) });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.raisePassExpiry).not.toHaveBeenCalled();
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
    expect(deps.raisePassExpiry).not.toHaveBeenCalled();
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

  it('orderId 없이 환불하지 못한 경우 구매 토큰 전체를 로그에 남기지 않는다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const longToken = 'abcdefghijklmnopqrstuvwxyz0123456789-secret-token';
    const { deps } = createFakeDeps({
      now: AFTER_GRACE,
      playPurchase: purchase({
        purchaseTimeMillis: String(AFTER_GRACE.getTime()),
        orderId: undefined,
      }),
    });

    await verifyPurchase(deps, { ...input, purchaseToken: longToken });

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(longToken);
    expect(logged).toContain(longToken.slice(0, 8));
    errorSpy.mockRestore();
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

  it('만료일 기록 전에 요청이 끊겨도 재시도의 already_processed 경로에서 복구된다', async () => {
    const { deps, play, rows, expiries } = createFakeDeps({
      raiseError: new Error('connection lost'),
    });

    await expect(verifyPurchase(deps, input)).rejects.toThrow('connection lost');
    expect(rows).toHaveLength(1);
    expect(expiries.has(UID)).toBe(false);

    const retry = await verifyPurchase(deps, input);

    const expectedExpiry = new Date(IN_EARLY1.getTime() + 35 * DAY_MS);
    expect(retry).toEqual({
      status: 'already_processed',
      passExpiresAt: expectedExpiry.toISOString(),
    });
    expect(expiries.get(UID)).toEqual(expectedExpiry);
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P1900, TOKEN);
  });

  it('동시 구매에서 오래된 짧은 만료일이 저장된 긴 만료일을 줄이지 않는다', async () => {
    // 다른 요청(B)이 먼저 더 긴 만료일을 기록해 둔 상태에서, A는 B를 못 본 목록으로 계산한다
    const longer = new Date(IN_EARLY1.getTime() + 70 * DAY_MS);
    const { deps, expiries } = createFakeDeps({ storedExpiry: longer });

    const result = await verifyPurchase(deps, input);

    expect(deps.raisePassExpiry).toHaveBeenCalledWith(
      UID,
      new Date(IN_EARLY1.getTime() + 35 * DAY_MS)
    );
    expect(result).toEqual({ status: 'granted', passExpiresAt: longer.toISOString() });
    expect(expiries.get(UID)).toEqual(longer);
  });
});
