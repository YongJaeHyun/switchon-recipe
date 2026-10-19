import { TIME_ZONE } from 'const/const';
import { formatInTimeZone } from 'date-fns-tz';
import { REGULAR_PRICE_KRW, type SalesState } from 'types/pass';

const DAY_MS = 24 * 60 * 60 * 1000;

// Intl 지원 여부와 무관하게 천 단위 쉼표
const formatKrw = (krw: number) => `${String(krw).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

const kstYmd = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd');
const kstMonthDay = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'M월 d일');

// 두 'yyyy-MM-dd' 캘린더 날짜 사이 일수
const daysBetweenYmd = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// 패스 남은 기간. 만료됐거나 패스가 없으면 null. D-day는 KST 날짜로 센다
export function formatPassRemaining(passExpiresAt: string | null, now: Date): string | null {
  if (!passExpiresAt) return null;
  const expiresAt = new Date(passExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;

  const days = daysBetweenYmd(kstYmd(now), kstYmd(expiresAt));
  const dDay = days === 0 ? 'D-day' : `D-${days}`;
  return `${dDay} (${kstMonthDay(expiresAt)}까지)`;
}

// 결제 화면 가격 문구. 판매 중이 아니면 price는 빈 문자열
export function formatSalesHeadline(sales: SalesState): {
  price: string;
  original: string | null;
  badge: string | null;
  next: string | null;
} {
  if (!sales.onSale || sales.priceKrw === null) {
    return { price: '', original: null, badge: null, next: null };
  }

  const discounted = sales.priceKrw < REGULAR_PRICE_KRW;
  // 할인율은 내림 (1,900원 = 61%, 2,900원 = 40%)
  const discountPercent = Math.floor((1 - sales.priceKrw / REGULAR_PRICE_KRW) * 100);
  const next = sales.nextTier
    ? `${kstMonthDay(new Date(sales.nextTier.startsAt))}부터 ${formatKrw(sales.nextTier.priceKrw)}`
    : null;

  return {
    price: formatKrw(sales.priceKrw),
    original: discounted ? formatKrw(REGULAR_PRICE_KRW) : null,
    badge: discounted ? `${discountPercent}% 할인` : null,
    next,
  };
}
