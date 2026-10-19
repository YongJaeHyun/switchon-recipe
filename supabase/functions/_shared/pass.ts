// 스위치온 패스 가격 구간(early1/early2/regular) 및 만료일 계산 순수 로직.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export const PASS_DAYS = 35;
export const GRACE_MS = 24 * 60 * 60 * 1000;

export type Tier = 'early1' | 'early2' | 'regular';

export const PASS_PRODUCTS: Record<Tier, { productId: string; priceKrw: number }> = {
  early1: { productId: 'switchon_pass_5w_1900', priceKrw: 1900 },
  early2: { productId: 'switchon_pass_5w_2900', priceKrw: 2900 },
  regular: { productId: 'switchon_pass_5w_4900', priceKrw: 4900 },
};

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
}

export interface PurchaseForExpiry {
  purchasedAt: Date;
  status: 'granted' | 'voided' | 'refunded_ineligible';
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
    };
  }

  const { early1Start, early1End, early2Start, early2End } = windows;
  const t = now.getTime();

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
  if (t < early1Start.getTime()) {
    nextTier = {
      tier: 'early1',
      priceKrw: PASS_PRODUCTS.early1.priceKrw,
      startsAt: early1Start.toISOString(),
    };
  } else if (t < early1End.getTime()) {
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

  return { onSale: true, freeActive, tier, productId, priceKrw, freeDaysLeft, nextTier };
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

export function computeExpiry(purchases: PurchaseForExpiry[]): Date | null {
  const granted = purchases
    .filter((p) => p.status === 'granted')
    .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());

  if (granted.length === 0) return null;

  let expiry: Date | null = null;
  for (const purchase of granted) {
    const base: Date =
      expiry && expiry.getTime() > purchase.purchasedAt.getTime() ? expiry : purchase.purchasedAt;
    expiry = new Date(base.getTime() + PASS_DAYS * DAY_MS);
  }

  return expiry;
}
