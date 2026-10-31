import { TIME_ZONE } from 'const/const';
import { formatInTimeZone } from 'date-fns-tz';
import { REGULAR_PRICE_KRW, type SalesState } from 'types/pass';

const DAY_MS = 24 * 60 * 60 * 1000;

// Intl 지원 여부와 무관하게 천 단위 쉼표
export const formatKrw = (krw: number) => `${String(krw).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

const kstYmd = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd');
const kstMonthDay = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'M월 d일');

// 두 'yyyy-MM-dd' 캘린더 날짜 사이 일수
const daysBetweenYmd = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// 패스 남은 기간 ("35일 남음 (12월 5일까지)"). 만료됐거나 패스가 없으면 null. 남은 날은 KST 날짜로 센다
export function formatPassRemaining(passExpiresAt: string | null, now: Date): string | null {
  if (!passExpiresAt) return null;
  const expiresAt = new Date(passExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;

  const days = daysBetweenYmd(kstYmd(now), kstYmd(expiresAt));
  if (days === 0) return `오늘까지 (${kstMonthDay(expiresAt)})`;
  return `${days}일 남음 (${kstMonthDay(expiresAt)}까지)`;
}

// 첫 구매 할인가 아래에 붙이는 안내
export const FIRST_PURCHASE_NOTE = '처음 한 번만 이 가격이에요';

// 결제 화면 가격 문구. 판매 중이 아니면 price는 빈 문자열.
// 할인 표시(정가 줄긋기·할인율·"처음 한 번만")는 서버가 첫 구매 할인가를 줄 때만 (firstPurchaseDiscount).
// 이 필드를 모르는 옛 서버면 가격이 정가보다 낮을 때 할인으로 보인다
export function formatSalesHeadline(sales: SalesState): {
  price: string;
  original: string | null;
  badge: string | null;
  note: string | null;
  next: string | null;
} {
  if (!sales.onSale || sales.priceKrw === null) {
    return { price: '', original: null, badge: null, note: null, next: null };
  }

  const discounted = sales.priceKrw < REGULAR_PRICE_KRW && sales.firstPurchaseDiscount !== false;
  // 할인율은 정가 대비로 계산해 내림 (부풀려 보이지 않게): 2,900원 = 40%
  const discountPercent = Math.floor((1 - sales.priceKrw / REGULAR_PRICE_KRW) * 100);
  const next = sales.nextTier
    ? `${kstMonthDay(new Date(sales.nextTier.startsAt))}부터 ${formatKrw(sales.nextTier.priceKrw)}`
    : null;

  return {
    price: formatKrw(sales.priceKrw),
    original: discounted ? formatKrw(REGULAR_PRICE_KRW) : null,
    badge: discounted ? `${discountPercent}% 할인` : null,
    note: discounted && sales.firstPurchaseDiscount === true ? FIRST_PURCHASE_NOTE : null,
    next,
  };
}
