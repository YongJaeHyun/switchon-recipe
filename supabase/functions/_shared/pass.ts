// 스위치온 패스 상품(5주 가격 구간, 1주 고정 가격) 및 만료일 계산 순수 로직.
// 5주 패스 가격 (운영자 결정 2026-11-01): 출시 할인 기간(premium_setting free_start~free_end) 안에서
// 5주 패스를 처음 사는 사람만 2,900원(early2), 그 밖에는 모두 4,900원(regular).
// 1,900원(early1)은 더 팔지 않는다. 옛 기록을 알아보도록 상품 목록에만 남겨 둔다
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export const PASS_DAYS = 35;
export const GRACE_MS = 24 * 60 * 60 * 1000;

export type Tier = 'early1' | 'early2' | 'regular';

// early1(1,900원)은 판매하지 않는다: getSalesState가 내주지 않고 새 구매는 isPurchaseEligible이 막는다
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
// 구매 하나로 받을 수 있는 한 주 더 하기 연장 횟수 (운영자 결정 2026-10-31). DB 함수와 같은 값.
// 앱 안내 문구용 복사본: utils/passOptions.ts FIVE_WEEK_MAX_EXTENSIONS (utils/passOptions.serverCopy.test.ts로 확인)
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
  // 지금 5주 패스 가격이 첫 구매 할인(2,900원)인지. 앱은 이때만 정가 줄긋기·"처음 한 번만" 안내를 보인다
  firstPurchaseDiscount: boolean;
}

// 첫 구매 할인 상품 (출시 할인 기간 안, 5주 패스 첫 구매만)
export const FIRST_PURCHASE_DISCOUNT_TIER: Tier = 'early2';

export const isFiveWeekProduct = (productId: string) => tierOfProduct(productId) !== null;

// 5주 패스 첫 구매 할인을 이미 썼는지: granted인 5주 패스 구매가 하나라도 있으면 썼다.
// 환불(voided)되거나 서버가 돌려준(refunded_ineligible) 구매는 할인을 쓴 것으로 보지 않는다.
// 1주 패스는 세지 않는다 (운영자 결정 2026-11-01)
export function hasUsedFirstPurchaseDiscount(
  purchases: Pick<PurchaseForExpiry, 'productId' | 'status'>[]
): boolean {
  return purchases.some((p) => p.status === 'granted' && isFiveWeekProduct(p.productId));
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

// 출시 할인 기간 = 무료 기간: free_start 00:00 KST ~ free_end 다음날 00:00 KST
interface LaunchWindow {
  start: Date;
  end: Date;
}

const launchWindow = (setting: PremiumSetting): LaunchWindow | null => {
  if (!setting.freeStart || !setting.freeEnd) return null;
  return {
    start: kstMidnightInstant(setting.freeStart),
    end: kstMidnightInstant(setting.freeEnd, 1),
  };
};

export function isFreeActive(now: Date, setting: PremiumSetting): boolean {
  const launch = launchWindow(setting);
  if (!launch) return false;
  const t = now.getTime();
  return t >= launch.start.getTime() && t < launch.end.getTime();
}

// discountUsed: 이 유저가 5주 패스 첫 구매 할인을 이미 썼는지 (hasUsedFirstPurchaseDiscount)
export function getSalesState(
  now: Date,
  setting: PremiumSetting,
  { discountUsed = false }: { discountUsed?: boolean } = {}
): SalesState {
  const launch = launchWindow(setting);
  if (!launch) {
    return {
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
      nextTier: null,
      weekPass: null,
      firstPurchaseDiscount: false,
    };
  }

  const t = now.getTime();
  const launchTier: Tier = discountUsed ? 'regular' : FIRST_PURCHASE_DISCOUNT_TIER;

  // 무료 기간 시작 전에는 팔지 않음: 하루 먼저 산 사람이 정가를 내는 일을 막기 위해 (운영자 결정)
  if (t < launch.start.getTime()) {
    return {
      onSale: false,
      freeActive: false,
      tier: null,
      productId: null,
      priceKrw: null,
      freeDaysLeft: 0,
      nextTier: {
        tier: launchTier,
        priceKrw: PASS_PRODUCTS[launchTier].priceKrw,
        startsAt: launch.start.toISOString(),
      },
      weekPass: null,
      firstPurchaseDiscount: false,
    };
  }

  const freeActive = t < launch.end.getTime();
  const tier: Tier = freeActive ? launchTier : 'regular';
  const { productId, priceKrw } = PASS_PRODUCTS[tier];

  const freeDaysLeft = freeActive
    ? daysBetweenYmd(kstDateString(now), setting.freeEnd as string) + 1
    : 0;

  // 할인가로 파는 동안만 다음 가격(할인 기간이 끝나면 4,900원)을 알려준다
  const nextTier: SalesState['nextTier'] =
    tier === FIRST_PURCHASE_DISCOUNT_TIER
      ? {
          tier: 'regular',
          priceKrw: PASS_PRODUCTS.regular.priceKrw,
          startsAt: launch.end.toISOString(),
        }
      : null;

  return {
    onSale: true,
    freeActive,
    tier,
    productId,
    priceKrw,
    freeDaysLeft,
    nextTier,
    weekPass: WEEK_PASS_PRODUCT,
    firstPurchaseDiscount: tier === FIRST_PURCHASE_DISCOUNT_TIER,
  };
}

export function tierOfProduct(productId: string): Tier | null {
  const entry = (
    Object.entries(PASS_PRODUCTS) as [Tier, { productId: string; priceKrw: number }][]
  ).find(([, v]) => v.productId === productId);
  return entry ? entry[0] : null;
}

// userPurchases: 이 유저의 이미 기록된 구매. 할인가 구매는 출시 할인 기간(+ 유예) 안에 샀고 이미 지급된
// granted 5주 패스가 없을 때만 유효하다. 구매 시각이 아니라 검증 순서로 정한다: 먼저 검증돼 지급된 구매가 할인을
// 갖고, 이미 지급한 구매는 나중에 되돌리지 않는다 (운영자 결정 2026-11-01).
// 동시 검증은 DB 함수 grant_pass_purchase가 유저별 lock 안에서 같은 확인을 다시 해 막는다
export function isPurchaseEligible(
  productId: string,
  purchasedAt: Date,
  setting: PremiumSetting,
  userPurchases: Pick<PurchaseForExpiry, 'productId' | 'status'>[] = []
): boolean {
  // 1주 패스는 가격이 하나뿐이라 언제 사도 유효하다
  if (productId === WEEK_PASS_PRODUCT.productId) return true;
  const tier = tierOfProduct(productId);
  if (!tier) return false;
  if (tier === 'regular') return true;
  // 1,900원은 더 팔지 않는다 (운영자 결정 2026-11-01)
  if (tier !== FIRST_PURCHASE_DISCOUNT_TIER) return false;

  const launch = launchWindow(setting);
  if (!launch) return false;
  if (hasUsedFirstPurchaseDiscount(userPurchases)) return false;

  const t = purchasedAt.getTime();
  return t >= launch.start.getTime() && t < launch.end.getTime() + GRACE_MS;
}

// t가 속한 KST 날짜의 마지막 순간 (23:59:59.999 KST). 패스는 마지막 날 밤까지 쓴다 (운영자 결정 2026-11-01:
// 화면은 "12월 5일까지"처럼 날짜만 보여 주는데 결제 시각에 끝나면 그날 저녁에 갑자기 막힌다)
export function endOfKstDay(t: number): number {
  const kstDayStart = Math.floor((t + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return kstDayStart + DAY_MS - 1;
}

// granted 구매와 한 주 더 하기 연장을 시간 순으로 쌓아 만료일을 만든다.
// 구매마다 상품 일수를 더한 뒤 그날 KST 23:59:59.999로 올린다 (연장 +7일은 그 시각을 그대로 유지한다)
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
    expiry = endOfKstDay(base + (product?.days ?? PASS_DAYS) * DAY_MS);
    remaining.set(event.token, product?.maxExtensions ?? FIVE_WEEK_MAX_EXTENSIONS);
  }

  return expiry === null ? null : new Date(expiry);
}
