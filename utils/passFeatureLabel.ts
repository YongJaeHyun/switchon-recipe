// 패스 기능 표시(입구 배지, 기능 안 무료 체험 안내) 문구. 모든 패스 기능이 같은 규칙을 쓴다
import type { TrialEntryState } from './passTrial';

export type PassBadgeState =
  // 패스를 쓰고 있다
  | { kind: 'pass' }
  // 패스 없이 무료 체험이 남았다
  | { kind: 'trial'; remaining: number }
  // 패스가 필요하다 (체험을 다 썼거나 체험이 없는 기능)
  | { kind: 'locked' };

// 입구 배지 상태. entry는 무료 체험이 있는 기능(음식 판정, 이름으로 만들기)만 넘긴다
export function passBadgeState(hasAccess: boolean, entry?: TrialEntryState): PassBadgeState {
  if (hasAccess) return { kind: 'pass' };
  if (entry?.kind === 'trial' && entry.remaining > 0) {
    return { kind: 'trial', remaining: entry.remaining };
  }
  return { kind: 'locked' };
}

export function passBadgeLabel(state: PassBadgeState): string {
  return state.kind === 'trial' ? `패스 · 무료 체험 ${state.remaining}번 남음` : '패스';
}

export function passBadgeA11yLabel(state: PassBadgeState): string {
  if (state.kind === 'pass') return '스위치온 패스 기능';
  if (state.kind === 'trial') return `스위치온 패스 기능, 무료 체험 ${state.remaining}번 남음`;
  return '스위치온 패스 기능, 패스가 필요해요';
}

export interface PassBannerText {
  title: string;
  detail: string;
}

// 기능 안 맨 위 안내 (패스 없이 무료 체험으로 쓰는 중). remaining은 이번에 쓰기 전 남은 횟수
export function passTrialBannerText(remaining: number): PassBannerText {
  return {
    title: '스위치온 패스 기능을 무료로 써 보고 있어요',
    detail: remaining <= 1 ? '이번이 마지막 무료 체험이에요' : `남은 무료 체험 ${remaining}번`,
  };
}

// 패스 없이 한 번 받은 무료 1주차 리포트 (사용자당 평생 한 번)
export function passGiftBannerText(): PassBannerText {
  return {
    title: '스위치온 패스 기능을 무료로 받아 봤어요',
    detail: '무료 리포트는 한 번만 드려요',
  };
}

// 패스가 있어야 쓰는 기능 화면 (무료 체험 없음). detail은 패스 없이 할 수 있는 것을 화면마다 알려 준다
export function passLockedBannerText(detail: string): PassBannerText {
  return { title: '스위치온 패스 기능이에요', detail };
}
