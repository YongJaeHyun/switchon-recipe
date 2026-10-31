// 패스 기능 무료 체험(음식 판정, 음식 이름으로 만들기) 진입 상태 공통 규칙 (표시용 순수 함수).
// 서버가 최종 판단하고, 남은 횟수는 get-pass-status 값을 참고만 한다
import type { PassStatus } from 'types/pass';
import { isPassOnSale } from './passScreen';

export type TrialEntryState =
  | { kind: 'hidden' }
  | { kind: 'open' }
  | { kind: 'trial'; remaining: number }
  // 무료 체험을 다 썼다: 누르면 패스 안내
  | { kind: 'locked' };

// 패스 없이 남은 무료 횟수. 패스가 있거나 상태를 모르거나 옛 서버(필드 없음)면 0
export function trialRemainingOf(status: PassStatus | undefined, raw: number | undefined): number {
  if (!status || status.hasAccess) return 0;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

// 무료 체험은 판매가 꺼져 있어도 그대로 쓸 수 있다. 다 썼으면 판매 중일 때만 잠금으로 보이고, 아니면 숨긴다
export function trialEntryState(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined,
  raw: number | undefined
): TrialEntryState {
  if (!status) return { kind: 'hidden' };
  if (status.hasAccess) return { kind: 'open' };
  // 남은 횟수를 모르면(조회 실패·옛 서버) 막지 않고 서버 판단에 맡긴다
  if (raw === undefined) return { kind: 'open' };
  const remaining = trialRemainingOf(status, raw);
  if (remaining > 0) return { kind: 'trial', remaining };
  return isPassOnSale(status.sales, billingAvailable) ? { kind: 'locked' } : { kind: 'hidden' };
}
