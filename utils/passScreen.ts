// 결제 화면/홈 배너/프로필에서 쓰는 순수 함수. 화면 컴포넌트는 이 결과를 보여주기만 한다
import { TIME_ZONE } from 'const/const';
import type { ErrorToastText, SuccessToastText } from 'const/toastText';
import { formatInTimeZone } from 'date-fns-tz';
import type { SalesState, VerifyResult } from 'types/pass';
import { formatSalesHeadline } from './passDisplay';

const DAY_MS = 24 * 60 * 60 * 1000;

const kstYmd = (date: Date) => formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd');

// 패스 진입점(홈 배너, 프로필 "패스 구매", 결제 화면)을 보일지. 서버가 판매 중이고 이 바이너리에서
// 결제를 쓸 수 있을 때만 true. 결제 가능 여부를 아직 모르면(undefined) 숨긴다.
// 같은 runtime version의 결제 모듈 없는 구 빌드가 OTA로 이 화면을 받아도 결제 진입점이 안 보이게 한다
export function isPassOnSale(
  sales: SalesState | undefined,
  billingAvailable: boolean | undefined
): boolean {
  return sales?.onSale === true && billingAvailable === true;
}

// 홈 배너 문구. 판매 중(결제 가능)이고 무료 기간(사전 결제 할인)일 때만. 그 밖에는 null (배너 숨김)
export function getPassBannerText(
  sales: SalesState | undefined,
  billingAvailable: boolean | undefined
): string | null {
  if (!sales || !isPassOnSale(sales, billingAvailable) || !sales.freeActive) return null;
  const { badge } = formatSalesHeadline(sales);
  if (!badge) return null;
  return `지금 사면 ${badge} · D-${sales.freeDaysLeft}`;
}

export type VerifyResultToast =
  | { type: 'success'; textType: keyof typeof SuccessToastText }
  | { type: 'error'; textType: keyof typeof ErrorToastText };

// 서버 검증 결과별 토스트. already_processed(같은 구매를 이미 반영함)는 패스가 아직 남아 있을 때만
// 성공으로 취급한다. 만료일이 없거나 지났으면(환불된 구매 등) 활성화됐다고 하지 않는다
export function getVerifyResultToast(result: VerifyResult, now: Date): VerifyResultToast {
  switch (result.status) {
    case 'granted':
      return { type: 'success', textType: 'PASS_ACTIVATED' };
    case 'already_processed':
      return getPassRemainingDays(result.passExpiresAt, now) !== null
        ? { type: 'success', textType: 'PASS_ACTIVATED' }
        : { type: 'error', textType: 'PASS_ALREADY_PROCESSED' };
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
