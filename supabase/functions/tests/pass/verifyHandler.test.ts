import { describe, expect, it, vi } from 'vitest';
import type { ProductPurchase } from '../../_shared/googlePlay.ts';
import { computeExpiry, endOfKstDay, type PremiumSetting } from '../../_shared/pass.ts';
import {
  type PurchaseRow,
  type VerifyDeps,
  verifyPurchase,
} from '../../verify-pass-purchase/handler.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
// 패스 만료일은 그날 KST 23:59:59.999로 올려 잡는다 (운영자 결정 2026-11-01)
const eod = (d: Date) => new Date(endOfKstDay(d.getTime()));
const UID = 'user-1';
const TOKEN = 'token-1';
const P1900 = 'switchon_pass_5w_1900';
const P2900 = 'switchon_pass_5w_2900';
const P4900 = 'switchon_pass_5w_4900';
const P1W = 'switchon_pass_1w_1500';

// 무료(출시 할인) 기간 2026-11-01 ~ 2026-11-14 (KST): 2026-10-31T15:00Z ~ 2026-11-14T15:00Z
const SETTING: PremiumSetting = { freeStart: '2026-11-01', freeEnd: '2026-11-14' };
const IN_EARLY1 = new Date('2026-11-02T03:00:00.000Z');
// 할인 기간 종료 + 24시간 유예 (2026-11-15T15:00Z) 이후
const AFTER_GRACE = new Date('2026-11-16T00:00:00.000Z');

const purchase = (overrides: Partial<ProductPurchase> = {}): ProductPurchase => ({
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  purchaseTimeMillis: String(IN_EARLY1.getTime()),
  orderId: 'GPA.1234',
  obfuscatedExternalAccountId: UID,
  productId: P2900,
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
      return row ? { status: row.status, uid: row.uid, purchasedAt: row.purchasedAt } : null;
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
      if (rows.some((r) => r.purchaseToken === row.purchaseToken)) return 'duplicate' as const;
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
    // DB 함수 grant_pass_purchase처럼 확인과 기록을 한 번에 (JS에서는 await 없이 끝나 원자적)
    grantPurchase: vi.fn(async (row: PurchaseRow, checkFirstPurchaseDiscount: boolean) => {
      if (options.insertResult === 'duplicate') return 'duplicate' as const;
      if (rows.some((r) => r.purchaseToken === row.purchaseToken)) return 'duplicate' as const;
      if (
        checkFirstPurchaseDiscount &&
        rows.some(
          (r) =>
            r.uid === row.uid &&
            r.status === 'granted' &&
            r.productId.startsWith('switchon_pass_5w_')
        )
      ) {
        return 'discount_used' as const;
      }
      rows.push(row);
      return 'inserted' as const;
    }),
    play,
  };

  return { deps, play, rows, expiries };
};

const existingRow = (overrides: Partial<PurchaseRow> = {}): PurchaseRow => ({
  uid: UID,
  productId: P4900,
  purchaseToken: 'old-token',
  orderId: 'GPA.0001',
  priceKrw: 4900,
  purchasedAt: new Date('2026-11-01T00:00:00.000Z'),
  grantedFrom: new Date('2026-11-01T00:00:00.000Z'),
  grantedUntil: eod(new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 35 * DAY_MS)),
  status: 'granted',
  raw: {},
  ...overrides,
});

const input = { uid: UID, productId: P2900, purchaseToken: TOKEN };

describe('verifyPurchase: 1주 패스', () => {
  const weekInput = { uid: UID, productId: P1W, purchaseToken: TOKEN };

  it('1주 패스는 7일, 1,500원으로 기록하고 소비한다', async () => {
    const { deps, play, rows } = createFakeDeps({ playPurchase: purchase({ productId: P1W }) });

    const result = await verifyPurchase(deps, weekInput);

    const expectedExpiry = eod(new Date(IN_EARLY1.getTime() + 7 * DAY_MS));
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });
    expect(rows[0]).toMatchObject({
      productId: P1W,
      priceKrw: 1500,
      // 시작은 구매 시각 (끝만 마지막 날 23:59:59 KST로 올린다)
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
      grantedUntil: eod(new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 7 * DAY_MS)),
    });
    const { deps } = createFakeDeps({ existing: [weekRow] });

    const result = await verifyPurchase(deps, input);

    const expectedExpiry = eod(
      new Date(new Date('2026-11-01T00:00:00.000Z').getTime() + 42 * DAY_MS)
    );
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
      storedExpiry: eod(new Date(p1.getTime() + 42 * DAY_MS)), // DB 함수가 이미 +7일
      playPurchase: purchase({ productId: P4900, purchaseTimeMillis: String(later.getTime()) }),
      now: later,
    });

    const result = await verifyPurchase(deps, { ...input, productId: P4900 });

    const expected = eod(new Date(p1.getTime() + 77 * DAY_MS));
    expect(result).toEqual({ status: 'granted', passExpiresAt: expected.toISOString() });
    expect(rows[1]).toMatchObject({
      grantedFrom: eod(new Date(p1.getTime() + 42 * DAY_MS)),
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
      passExpiresAt: eod(new Date(p1.getTime() + 42 * DAY_MS)).toISOString(),
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
      passExpiresAt: eod(new Date(p1.getTime() + 56 * DAY_MS)).toISOString(),
    });
  });
});

describe('verifyPurchase: Play 응답의 상품', () => {
  // Play 응답의 productId는 "없을 수도 있다"(Google 문서). 조회 주소가 이미 상품별이라
  // (purchases/products/{productId}/tokens/{token}) 다른 상품의 토큰이면 Play가 응답하지 않는다
  it('Play 응답에 productId가 없어도 요청한 상품으로 지급한다', async () => {
    const { deps, rows } = createFakeDeps({ playPurchase: purchase({ productId: undefined }) });

    expect((await verifyPurchase(deps, input)).status).toBe('granted');
    expect(rows).toHaveLength(1);
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

    const expectedExpiry = eod(new Date(IN_EARLY1.getTime() + 35 * DAY_MS));
    expect(result).toEqual({ status: 'granted', passExpiresAt: expectedExpiry.toISOString() });

    expect(deps.grantPurchase).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uid: UID,
      productId: P2900,
      purchaseToken: TOKEN,
      orderId: 'GPA.1234',
      priceKrw: 2900,
      purchasedAt: IN_EARLY1,
      // 시작은 구매 시각 (끝만 마지막 날 23:59:59 KST로 올린다)
      grantedFrom: IN_EARLY1,
      grantedUntil: expectedExpiry,
      status: 'granted',
    });

    expect(expiries.get(UID)).toEqual(
      computeExpiry([{ productId: P2900, purchasedAt: IN_EARLY1, status: 'granted' }])
    );
    expect(play.consumeProductPurchase).toHaveBeenCalledTimes(1);
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P2900, TOKEN);
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
    expect(deps.grantPurchase).not.toHaveBeenCalled();
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
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P2900, TOKEN);
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.grantPurchase).not.toHaveBeenCalled();
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
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P2900, TOKEN);
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.grantPurchase).not.toHaveBeenCalled();
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
    expect(deps.grantPurchase).not.toHaveBeenCalled();
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
    expect(deps.grantPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('obfuscatedExternalAccountId가 없으면 invalid', async () => {
    const { deps } = createFakeDeps({
      playPurchase: purchase({ obfuscatedExternalAccountId: undefined }),
    });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.grantPurchase).not.toHaveBeenCalled();
  });

  it('모르는 productId면 Play 호출 없이 invalid', async () => {
    const { deps, play } = createFakeDeps();

    const result = await verifyPurchase(deps, { ...input, productId: 'unknown_product' });

    expect(result).toEqual({ status: 'invalid' });
    expect(play.getProductPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
    expect(play.refundOrder).not.toHaveBeenCalled();
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.grantPurchase).not.toHaveBeenCalled();
  });

  it('유예 밖의 2,900원 구매는 환불하고 refunded_ineligible로 기록, price_changed', async () => {
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
    const previousExpiry = previous.grantedUntil as Date; // 2026-12-06 23:59:59.999 KST
    const { deps, rows, expiries } = createFakeDeps({
      existing: [previous],
      playPurchase: purchase({ productId: P4900 }),
    });

    const result = await verifyPurchase(deps, { ...input, productId: P4900 });

    const expectedExpiry = eod(new Date(previousExpiry.getTime() + 35 * DAY_MS));
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
    expect(expiries.get(UID)).toEqual(eod(new Date(IN_EARLY1.getTime() + 35 * DAY_MS)));
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('Play 응답의 productId가 요청과 다르면 invalid', async () => {
    const { deps } = createFakeDeps({ playPurchase: purchase({ productId: P4900 }) });

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'invalid' });
    expect(deps.insertPurchase).not.toHaveBeenCalled();
    expect(deps.grantPurchase).not.toHaveBeenCalled();
  });

  it('만료일 기록 전에 요청이 끊겨도 재시도의 already_processed 경로에서 복구된다', async () => {
    const { deps, play, rows, expiries } = createFakeDeps({
      raiseError: new Error('connection lost'),
    });

    await expect(verifyPurchase(deps, input)).rejects.toThrow('connection lost');
    expect(rows).toHaveLength(1);
    expect(expiries.has(UID)).toBe(false);

    const retry = await verifyPurchase(deps, input);

    const expectedExpiry = eod(new Date(IN_EARLY1.getTime() + 35 * DAY_MS));
    expect(retry).toEqual({
      status: 'already_processed',
      passExpiresAt: expectedExpiry.toISOString(),
    });
    expect(expiries.get(UID)).toEqual(expectedExpiry);
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P2900, TOKEN);
  });

  it('동시 구매에서 오래된 짧은 만료일이 저장된 긴 만료일을 줄이지 않는다', async () => {
    // 다른 요청(B)이 먼저 더 긴 만료일을 기록해 둔 상태에서, A는 B를 못 본 목록으로 계산한다
    const longer = eod(new Date(IN_EARLY1.getTime() + 70 * DAY_MS));
    const { deps, expiries } = createFakeDeps({ storedExpiry: longer });

    const result = await verifyPurchase(deps, input);

    expect(deps.raisePassExpiry).toHaveBeenCalledWith(
      UID,
      eod(new Date(IN_EARLY1.getTime() + 35 * DAY_MS))
    );
    expect(result).toEqual({ status: 'granted', passExpiresAt: longer.toISOString() });
    expect(expiries.get(UID)).toEqual(longer);
  });
});

describe('verifyPurchase: 지난 주 리포트 보충 (운영자 결정 2026-10-31)', () => {
  it('패스를 주면(1주 패스 포함) 그 유저의 보충을 시작한다', async () => {
    for (const productId of [P2900, P1W]) {
      const { deps } = createFakeDeps({ playPurchase: purchase({ productId }) });
      const backfillReports = vi.fn();
      const result = await verifyPurchase({ ...deps, backfillReports }, { ...input, productId });

      expect(result.status).toBe('granted');
      expect(backfillReports).toHaveBeenCalledTimes(1);
      expect(backfillReports).toHaveBeenCalledWith(UID);
    }
  });

  it('같은 유저의 재시도(already_processed, granted)도 구매 24시간 안이면 보충을 다시 시작한다', async () => {
    const purchasedAt = new Date(IN_EARLY1.getTime() - 23 * 60 * 60 * 1000);
    const { deps } = createFakeDeps({
      existing: [existingRow({ purchaseToken: TOKEN, purchasedAt })],
    });
    const backfillReports = vi.fn();
    const result = await verifyPurchase({ ...deps, backfillReports }, input);

    expect(result.status).toBe('already_processed');
    expect(backfillReports).toHaveBeenCalledWith(UID);
  });

  it('24시간이 지난 옛 토큰으로 다시 검증하면 보충하지 않는다 (시작일 바꿔 반복 악용 차단)', async () => {
    const purchasedAt = new Date(IN_EARLY1.getTime() - 24 * 60 * 60 * 1000);
    const { deps } = createFakeDeps({
      existing: [existingRow({ purchaseToken: TOKEN, purchasedAt })],
    });
    const backfillReports = vi.fn();
    for (let i = 0; i < 5; i++) {
      const result = await verifyPurchase({ ...deps, backfillReports }, input);
      expect(result.status).toBe('already_processed');
    }
    expect(backfillReports).not.toHaveBeenCalled();
  });

  it('insert가 duplicate(동시 요청)여도 방금 산 구매면 보충을 시작한다', async () => {
    const { deps } = createFakeDeps({ insertResult: 'duplicate' });
    const backfillReports = vi.fn();
    const result = await verifyPurchase({ ...deps, backfillReports }, input);

    expect(result.status).toBe('already_processed');
    expect(backfillReports).toHaveBeenCalledWith(UID);
  });

  it('invalid·price_changed·다른 유저 토큰·환불된 토큰이면 보충하지 않는다', async () => {
    const cases = [
      createFakeDeps({ playPurchase: purchase({ purchaseState: 1 }) }),
      createFakeDeps({
        playPurchase: purchase({ purchaseTimeMillis: String(AFTER_GRACE.getTime()) }),
        now: AFTER_GRACE,
      }),
      createFakeDeps({ existing: [existingRow({ purchaseToken: TOKEN, uid: 'other' })] }),
      createFakeDeps({
        existing: [existingRow({ purchaseToken: TOKEN, status: 'refunded_ineligible' })],
      }),
    ];
    for (const { deps } of cases) {
      const backfillReports = vi.fn();
      await verifyPurchase({ ...deps, backfillReports }, input);
      expect(backfillReports).not.toHaveBeenCalled();
    }
  });

  it('보충 시작이 실패해도 검증 결과는 그대로다', async () => {
    const { deps } = createFakeDeps();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backfillReports = vi.fn(() => {
      throw new Error('schedule failed');
    });
    const result = await verifyPurchase({ ...deps, backfillReports }, input);
    error.mockRestore();

    expect(result.status).toBe('granted');
    expect(backfillReports).toHaveBeenCalled();
  });
});

describe('verifyPurchase: 첫 구매 할인 (운영자 결정 2026-11-01)', () => {
  const earlier = new Date('2026-11-01T00:00:00.000Z');
  const later = new Date('2026-11-03T00:00:00.000Z');

  it('이미 지급된 5주 패스가 있으면 2,900원 구매는 환불하고 refunded_ineligible, price_changed', async () => {
    const { deps, play, rows } = createFakeDeps({
      existing: [existingRow({ productId: P4900, purchasedAt: earlier })],
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'price_changed' });
    expect(play.refundOrder).toHaveBeenCalledWith('GPA.1234');
    expect(rows[1]).toMatchObject({
      purchaseToken: TOKEN,
      status: 'refunded_ineligible',
      grantedFrom: null,
    });
    expect(rows[0].status).toBe('granted');
    expect(deps.grantPurchase).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('먼저 산 5주 패스가 환불(voided)됐으면 할인을 다시 받을 수 있다', async () => {
    const { deps, play } = createFakeDeps({
      existing: [existingRow({ productId: P2900, purchasedAt: earlier, status: 'voided' })],
    });

    expect((await verifyPurchase(deps, input)).status).toBe('granted');
    expect(play.refundOrder).not.toHaveBeenCalled();
  });

  it('1주 패스를 산 적이 있어도 5주 패스 첫 구매는 할인', async () => {
    const { deps, play } = createFakeDeps({
      existing: [existingRow({ productId: P1W, priceKrw: 1500, purchasedAt: earlier })],
    });

    expect((await verifyPurchase(deps, input)).status).toBe('granted');
    expect(play.refundOrder).not.toHaveBeenCalled();
  });

  it('할인을 쓴 뒤 4,900원 구매는 할인 기간 안에도 유효 (할인 확인 없이 기록)', async () => {
    const { deps, play } = createFakeDeps({
      existing: [existingRow({ productId: P2900, purchasedAt: earlier })],
      playPurchase: purchase({ productId: P4900 }),
    });

    expect((await verifyPurchase(deps, { ...input, productId: P4900 })).status).toBe('granted');
    expect(deps.grantPurchase).toHaveBeenCalledWith(expect.anything(), false);
    expect(play.refundOrder).not.toHaveBeenCalled();
  });

  it('2,900원 구매는 lock 안 확인을 켜서 기록한다', async () => {
    const { deps } = createFakeDeps();

    await verifyPurchase(deps, input);

    expect(deps.grantPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseToken: TOKEN, status: 'granted' }),
      true
    );
  });

  it('1,900원 새 구매는 할인 기간 안이어도 환불 (더 팔지 않음)', async () => {
    const { deps, play, rows } = createFakeDeps({ playPurchase: purchase({ productId: P1900 }) });

    expect(await verifyPurchase(deps, { ...input, productId: P1900 })).toEqual({
      status: 'price_changed',
    });
    expect(play.refundOrder).toHaveBeenCalledWith('GPA.1234');
    expect(rows[0]).toMatchObject({ productId: P1900, status: 'refunded_ineligible' });
  });

  it('동시에 검증된 할인 구매 둘: 정확히 하나만 지급, 다른 하나는 지급 전에 환불, 만료일은 줄지 않는다', async () => {
    const { deps, play, rows } = createFakeDeps();
    const tokenA = 'token-a';
    const tokenB = 'token-b';
    const times: Record<string, Date> = { [tokenA]: earlier, [tokenB]: later };
    play.getProductPurchase.mockImplementation(async (_productId: string, token: string) =>
      purchase({ purchaseTimeMillis: String(times[token].getTime()), orderId: `GPA.${token}` })
    );
    const raised: number[] = [];
    const raise = deps.raisePassExpiry;
    deps.raisePassExpiry = vi.fn(async (uid: string, expiresAt: Date) => {
      const stored = await raise(uid, expiresAt);
      raised.push(stored.getTime());
      return stored;
    });

    const results = await Promise.all([
      verifyPurchase(deps, { ...input, purchaseToken: tokenA }),
      verifyPurchase(deps, { ...input, purchaseToken: tokenB }),
    ]);

    // 둘 다 insert 전 확인을 통과했고, lock 안 확인에서 하나만 기록됐다
    expect(deps.grantPurchase).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.status).sort()).toEqual(['granted', 'price_changed']);
    const granted = rows.filter((r) => r.status === 'granted');
    const refunded = rows.filter((r) => r.status === 'refunded_ineligible');
    expect(granted).toHaveLength(1);
    expect(refunded).toHaveLength(1);
    expect(play.refundOrder).toHaveBeenCalledTimes(1);
    expect(play.refundOrder).toHaveBeenCalledWith(refunded[0].orderId);
    expect(play.consumeProductPurchase).toHaveBeenCalledTimes(1);
    expect(play.consumeProductPurchase).toHaveBeenCalledWith(P2900, granted[0].purchaseToken);
    // 저장된 만료일은 늘기만 한다
    expect(raised).toEqual([...raised].sort((a, b) => a - b));
    expect(raised.length).toBeGreaterThan(0);
  });

  it('구매 시각이 더 이른 할인 구매가 나중에 검증되면 그것을 환불하고, 이미 지급한 구매는 그대로 둔다', async () => {
    const grantedUntil = eod(new Date(later.getTime() + 35 * DAY_MS));
    const { deps, play, rows, expiries } = createFakeDeps({
      existing: [
        existingRow({
          productId: P2900,
          purchaseToken: 'later-token',
          orderId: 'GPA.LATER',
          purchasedAt: later,
          grantedFrom: later,
          grantedUntil,
        }),
      ],
      storedExpiry: grantedUntil,
      playPurchase: purchase({ purchaseTimeMillis: String(earlier.getTime()) }),
      now: later,
    });

    const result = await verifyPurchase(deps, input);

    expect(result).toEqual({ status: 'price_changed' });
    expect(rows[0]).toMatchObject({ purchaseToken: 'later-token', status: 'granted' });
    expect(rows[1]).toMatchObject({ purchaseToken: TOKEN, status: 'refunded_ineligible' });
    expect(play.refundOrder).toHaveBeenCalledTimes(1);
    expect(play.refundOrder).toHaveBeenCalledWith('GPA.1234');
    expect(expiries.get(UID)).toEqual(grantedUntil);
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });

  it('같은 할인 구매 토큰의 다른 요청이 먼저 지급했으면 환불하지 않는다 (재시도·복구가 동시에 올 때)', async () => {
    // 요청 B: findPurchase 때는 아직 없었고, Play 조회 사이에 요청 A가 같은 토큰을 granted로 기록했다
    const { deps, play, rows } = createFakeDeps({
      existing: [
        existingRow({
          productId: P2900,
          purchaseToken: TOKEN,
          orderId: 'GPA.1234',
          priceKrw: 2900,
        }),
      ],
    });
    vi.mocked(deps.findPurchase).mockResolvedValueOnce(null);

    const result = await verifyPurchase(deps, input);

    expect(result.status).toBe('already_processed');
    expect(play.refundOrder).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('granted');
  });

  it('지급하지 않는 구매는 기록을 먼저 남기고, 이미 기록된 토큰이면 환불하지 않는다', async () => {
    const { deps, play } = createFakeDeps({
      existing: [existingRow({ productId: P4900, purchasedAt: earlier })],
    });
    vi.mocked(deps.insertPurchase).mockResolvedValueOnce('duplicate');

    await verifyPurchase(deps, input);

    expect(play.refundOrder).not.toHaveBeenCalled();
  });

  it('insert 전 확인 뒤 다른 요청이 먼저 지급했으면(lock 안 확인이 discount_used) 지급하지 않고 환불', async () => {
    const { deps, play, rows } = createFakeDeps();
    vi.mocked(deps.grantPurchase).mockResolvedValueOnce('discount_used');

    expect(await verifyPurchase(deps, input)).toEqual({ status: 'price_changed' });
    expect(play.refundOrder).toHaveBeenCalledWith('GPA.1234');
    expect(rows).toEqual([expect.objectContaining({ status: 'refunded_ineligible' })]);
    expect(deps.raisePassExpiry).not.toHaveBeenCalled();
    expect(play.consumeProductPurchase).not.toHaveBeenCalled();
  });
});
