// 스위치온 패스 상품(5주 가격 구간 early1/early2/regular, 1주 고정 가격) 및 만료일 계산 순수 로직.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export const PASS_DAYS = 35;
export const GRACE_MS = 24 * 60 * 60 * 1000;

export type Tier = 'early1' | 'early2' | 'regular';

export const PASS_PRODUCTS: Record<Tier, { productId: string; priceKrw: number }> = {
  early1: { productId: 'switchon_pass_5w_1900', priceKrw: 1900 },
  early2: { productId: 'switchon_pass_5w_2900', priceKrw: 2900 },
  regular: { productId: 'switchon_pass_5w_4900', priceKrw: 4900 },
};

// 1주 패스: 가격 구간 없이 1,500원 고정 (운영자 결정 2026-10-31)
export const WEEK_PASS_PRODUCT = {
  productId: 'switchon_pass_1w_1500',
  priceKrw: 1500,
  days: 7,
} as const;

// 한 주 더 하기 한 번에 늘어나는 패스 일수 (pass_extension 한 행 = 7일, extend_pass_for_week_repeat와 같은 값)
export const PASS_EXTENSION_DAYS = 7;
// 구매 하나로 받을 수 있는 한 주 더 하기 연장 횟수 (운영자 결정 2026-10-31). DB 함수와 같은 값
export const FIVE_WEEK_MAX_EXTENSIONS = 2;
export const WEEK_PASS_MAX_EXTENSIONS = 0;

export interface PassProductInfo {
  priceKrw: number;
  days: number;
  maxExtensions: number;
}

// 상품별 가격·부여 일수·연장 상한. 모르는 상품이면 null
export function passProductOf(productId: string): PassProductInfo | null {
  if (productId === WEEK_PASS_PRODUCT.productId) {
    return {
      priceKrw: WEEK_PASS_PRODUCT.priceKrw,
      days: WEEK_PASS_PRODUCT.days,
      maxExtensions: WEEK_PASS_MAX_EXTENSIONS,
    };
  }
  const tier = tierOfProduct(productId);
  return tier
    ? {
        priceKrw: PASS_PRODUCTS[tier].priceKrw,
        days: PASS_DAYS,
        maxExtensions: FIVE_WEEK_MAX_EXTENSIONS,
      }
    : null;
}

export interface PremiumSetting {
  freeStart: string | null; // 'YYYY-MM-DD' KST
  freeEnd: string | null; // 'YYYY-MM-DD' KST
}

export interface SalesState {
  onSale: boolean;
  freeActive: boolean;
  tier: Tier | null;
  productId: string | null;
  priceKrw: number | null;
  freeDaysLeft: number; // 오늘 포함, 무료 기간 아니면 0
  nextTier: { tier: Tier; priceKrw: number; startsAt: string } | null; // ISO, 다음 가격 변경 시각
  // 1주 패스: 판매 중이면 늘 같은 가격. 5주 패스(productId/priceKrw)와 함께 고를 수 있게 내려준다
  weekPass: typeof WEEK_PASS_PRODUCT | null;
}

export interface PurchaseForExpiry {
  purchaseToken: string;
  productId: string;
  purchasedAt: Date;
  status: 'granted' | 'voided' | 'refunded_ineligible';
}

// 한 주 더 하기로 패스를 7일 늘린 기록 (pass_extension). 그때 패스를 받치던 구매에 묶인다
export interface ExtensionForExpiry {
  extendedAt: Date;
  purchaseToken: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseYmd = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
};

// dateStr(+ addDays일) 00:00 KST에 해당하는 UTC 시각.
const kstMidnightInstant = (dateStr: string, addDays = 0): Date => {
  const { y, m, d } = parseYmd(dateStr);
  const utcDateOnlyMs = Date.UTC(y, m - 1, d) + addDays * DAY_MS;
  return new Date(utcDateOnlyMs - KST_OFFSET_MS);
};

// now가 속한 KST 날짜를 'YYYY-MM-DD'로.
const kstDateString = (now: Date): string =>
  new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 두 'YYYY-MM-DD' 날짜(캘린더 날짜, 타임존 무관) 사이의 일수 차이.
const daysBetweenYmd = (fromStr: string, toStr: string): number => {
  const from = parseYmd(fromStr);
  const to = parseYmd(toStr);
  const ms = Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d);
  return Math.round(ms / DAY_MS);
};

interface TierWindows {
  early1Start: Date;
  early1End: Date;
  early2Start: Date;
  early2End: Date;
}

const tierWindows = (setting: PremiumSetting): TierWindows | null => {
  if (!setting.freeStart || !setting.freeEnd) return null;
  const early1Start = kstMidnightInstant(setting.freeStart);
  const early1End = kstMidnightInstant(setting.freeStart, 7);
  const early2End = kstMidnightInstant(setting.freeEnd, 1);
  return { early1Start, early1End, early2Start: early1End, early2End };
};

export function isFreeActive(now: Date, setting: PremiumSetting): boolean {
  const windows = tierWindows(setting);
  if (!windows) return false;
  const t = now.getTime();
  return t >= windows.early1Start.getTime() && t < windows.early2End.getTime();
}

export function getSalesState(now: Date, setting: PremiumSetting): SalesState {
  const windows = tierWindows(setting);
  if (!windows) {
    return {
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
      nextTier: null,
      weekPass: null,
    };
  }

  const { early1Start, early1End, early2Start, early2End } = windows;
  const t = now.getTime();

  // 무료 기간 시작 전에는 팔지 않음: 하루 먼저 산 사람이 정가를 내는 일을 막기 위해 (운영자 결정)
  if (t < early1Start.getTime()) {
    return {
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
      nextTier: {
        tier: 'early1',
        priceKrw: PASS_PRODUCTS.early1.priceKrw,
        startsAt: early1Start.toISOString(),
      },
      weekPass: null,
    };
  }

  let tier: Tier;
  if (t >= early1Start.getTime() && t < early1End.getTime()) {
    tier = 'early1';
  } else if (t >= early2Start.getTime() && t < early2End.getTime()) {
    tier = 'early2';
  } else {
    tier = 'regular';
  }

  const freeActive = tier === 'early1' || tier === 'early2';
  const { productId, priceKrw } = PASS_PRODUCTS[tier];

  const freeDaysLeft = freeActive
    ? daysBetweenYmd(kstDateString(now), setting.freeEnd as string) + 1
    : 0;

  let nextTier: SalesState['nextTier'] = null;
  if (t < early1End.getTime()) {
    nextTier = {
      tier: 'early2',
      priceKrw: PASS_PRODUCTS.early2.priceKrw,
      startsAt: early1End.toISOString(),
    };
  } else if (t < early2End.getTime()) {
    nextTier = {
      tier: 'regular',
      priceKrw: PASS_PRODUCTS.regular.priceKrw,
      startsAt: early2End.toISOString(),
    };
  }

  return {
    onSale: true,
    freeActive,
    tier,
    productId,
    priceKrw,
    freeDaysLeft,
    nextTier,
    weekPass: WEEK_PASS_PRODUCT,
  };
}

export function tierOfProduct(productId: string): Tier | null {
  const entry = (
    Object.entries(PASS_PRODUCTS) as [Tier, { productId: string; priceKrw: number }][]
  ).find(([, v]) => v.productId === productId);
  return entry ? entry[0] : null;
}

export function isPurchaseEligible(
  productId: string,
  purchasedAt: Date,
  setting: PremiumSetting
): boolean {
  // 1주 패스는 가격이 하나뿐이라 언제 사도 유효하다
  if (productId === WEEK_PASS_PRODUCT.productId) return true;
  const tier = tierOfProduct(productId);
  if (!tier) return false;
  if (tier === 'regular') return true;

  const windows = tierWindows(setting);
  if (!windows) return false;

  const [start, end] =
    tier === 'early1'
      ? [windows.early1Start, windows.early1End]
      : [windows.early2Start, windows.early2End];
  const t = purchasedAt.getTime();
  return t >= start.getTime() && t < end.getTime() + GRACE_MS;
}

// granted 구매와 한 주 더 하기 연장을 시간 순으로 쌓아 만료일을 만든다.
// - 구매: 그때 만료일이 남아 있으면 그 뒤에, 아니면 구매 시각부터 상품 일수만큼
// - 연장: +7일. 단 다음을 모두 만족할 때만 (DB 함수 extend_pass_for_week_repeat와 같은 상한. 행이 어떻게 생겼든
//   여기서 다시 막는다): 묶인 구매가 그 시각 전에 산 granted 구매이고, 그 상품의 연장 상한(5주 2번, 1주 0번)이
//   남았고, 그 시각에 패스가 남아 있었다. 묶인 구매가 환불되면 그 연장도 빠진다
// 같은 시각이면 구매를 먼저 본다
export function computeExpiry(
  purchases: PurchaseForExpiry[],
  extensions: ExtensionForExpiry[] = []
): Date | null {
  type Event =
    | { at: number; order: 0; kind: 'purchase'; token: string; productId: string }
    | { at: number; order: 1; kind: 'extension'; token: string };
  const events: Event[] = [
    ...purchases
      .filter((p) => p.status === 'granted')
      .map(
        (p): Event => ({
          at: p.purchasedAt.getTime(),
          order: 0,
          kind: 'purchase',
          token: p.purchaseToken,
          productId: p.productId,
        })
      ),
    ...extensions.map(
      (e): Event => ({
        at: e.extendedAt.getTime(),
        order: 1,
        kind: 'extension',
        token: e.purchaseToken,
      })
    ),
  ].sort((a, b) => a.at - b.at || a.order - b.order);

  // 이미 쌓은 구매별 남은 연장 횟수
  const remaining = new Map<string, number>();
  let expiry: number | null = null;
  for (const event of events) {
    if (event.kind === 'extension') {
      const left = remaining.get(event.token) ?? 0;
      if (left <= 0 || expiry === null || expiry <= event.at) continue;
      remaining.set(event.token, left - 1);
      expiry += PASS_EXTENSION_DAYS * DAY_MS;
      continue;
    }
    // granted 행은 검증된 상품뿐이다. 혹시 모르는 상품이면 예전처럼 5주(연장 상한 2번)로 본다
    const product = passProductOf(event.productId);
    const base: number = expiry !== null && expiry > event.at ? expiry : event.at;
    expiry = base + (product?.days ?? PASS_DAYS) * DAY_MS;
    remaining.set(event.token, product?.maxExtensions ?? FIVE_WEEK_MAX_EXTENSIONS);
  }

  return expiry === null ? null : new Date(expiry);
}
