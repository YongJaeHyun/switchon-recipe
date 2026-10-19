// 결제 화면/홈 배너/프로필에서 쓰는 순수 함수. 화면 컴포넌트는 이 결과를 보여주기만 한다
import { TIME_ZONE } from 'const/const';
import type { ErrorToastText, SuccessToastText } from 'const/toastText';
import { formatInTimeZone } from 'date-fns-tz';
import type { SalesState, VerifyResult } from 'types/pass';
import { formatSalesHeadline } from './passDisplay';

const DAY_MS = 24 * 60 * 60 * 1000;

const kstYmd = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd');

// 홈 배너 문구. 판매 중이고 무료 기간(사전 결제 할인)일 때만. 그 밖에는 null (배너 숨김)
export function getPassBannerText(sales: SalesState | undefined): string | null {
  if (!sales?.onSale || !sales.freeActive) return null;
  const { badge } = formatSalesHeadline(sales);
  if (!badge) return null;
  return `지금 사면 ${badge} · D-${sales.freeDaysLeft}`;
}

export type VerifyResultToast =
  | { type: 'success'; textType: keyof typeof SuccessToastText }
  | { type: 'error'; textType: keyof typeof ErrorToastText };

// 서버 검증 결과별 토스트. already_processed(같은 구매를 이미 반영함)는 성공으로 취급한다
export function getVerifyResultToast(result: VerifyResult): VerifyResultToast {
  switch (result.status) {
    case 'granted':
    case 'already_processed':
      return { type: 'success', textType: 'PASS_ACTIVATED' };
    case 'price_changed':
      return { type: 'error', textType: 'PASS_PRICE_CHANGED' };
    case 'invalid':
      return { type: 'error', textType: 'PASS_INVALID' };
  }
}

// 남은 패스 일수 (KST 날짜 차이, 만료 당일은 1일). 만료됐거나 패스가 없으면 null
export function getPassRemainingDays(passExpiresAt: string | null, now: Date): number | null {
  if (!passExpiresAt) return null;
  const expiresAt = new Date(passExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;

  const days = Math.round(
    (Date.parse(`${kstYmd(expiresAt)}T00:00:00Z`) - Date.parse(`${kstYmd(now)}T00:00:00Z`)) / DAY_MS
  );
  return Math.max(1, days);
}

// 탈퇴 확인 창 문구. 패스가 남아 있으면 경고를 덧붙인다
export function getDeleteAccountMessage(base: string, remainingDays: number | null): string {
  if (remainingDays === null) return base;
  return `${base}\n남은 패스 기간(${remainingDays}일)도 함께 사라져요.`;
}
