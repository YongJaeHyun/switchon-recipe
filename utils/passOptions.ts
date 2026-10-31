// 결제 화면에서 고를 수 있는 패스 상품(5주 패스·1주 패스)과 그 문구. 화면은 이 결과를 보여주기만 한다
import { passDaysOf, type SalesState } from 'types/pass';
import { formatKrw, formatSalesHeadline } from './passDisplay';
import { programWeekAndDay, startDateStatus } from './programStart';

export type PassOptionKind = 'fiveWeek' | 'week';

export interface PassOption {
  kind: PassOptionKind;
  productId: string;
  days: number;
  title: string;
  subtitle: string;
  price: string; // "1,900원"
  perWeek: string | null; // "주당 380원" (5주 패스만)
  original: string | null; // 할인 전 정가 "4,900원" (5주 패스가 할인 중일 때만)
  badge: string | null; // "61% 할인" (5주 패스가 할인 중일 때만)
  recommended: boolean;
}

// 한 주 더 하기로 늘어나는 횟수 상한. 앱은 서버 코드를 import하지 않으므로 같은 값을 세 곳에 둔다:
// 여기, 서버 supabase/functions/_shared/pass.ts FIVE_WEEK_MAX_EXTENSIONS, DB 함수 extend_pass_for_week_repeat
// (migrations/20261031010000). 앱과 서버 값은 utils/passOptions.serverCopy.test.ts가 같은지 확인한다
export const FIVE_WEEK_MAX_EXTENSIONS = 2;

// 프로그램이 한 주쯤 남은 4주차부터(유지기 포함)는 1주 패스를 추천한다 (운영자 결정 2026-10-31)
const WEEK_PASS_RECOMMENDED_FROM_WEEK = 4;

// 추천에 쓰는 프로그램 주차. number = 오늘 주차(5 = 유지기), null = 시작일 없음,
// 'loading' = 유저를 아직 불러오지 않아 모름 (딥링크·알림으로 앱을 막 켰을 때)
export type PassProgramWeek = number | null | 'loading';

// 패스 화면의 프로그램 주차. 유저를 불러오기 전 빈 시작일은 "없음"이 아니라 "모름"이다
export function passProgramWeek(input: {
  userId: string | null | undefined;
  startDate: string | null | undefined;
  today: string;
}): PassProgramWeek {
  const status = startDateStatus(input);
  if (status === 'loading') return 'loading';
  if (status === 'none') return null;
  return programWeekAndDay(input.startDate, input.today).week;
}

// 고를 수 있는 패스. 5주 패스(지금 가격 구간)와 1주 패스(판매 중일 때만), 추천 상품이 먼저.
// 주차를 아직 모르면('loading') 추천하지 않고 5주 패스부터. 판매 중이 아니면 빈 목록
export function getPassOptions(sales: SalesState, programWeek: PassProgramWeek): PassOption[] {
  if (!sales.onSale) return [];
  const options: PassOption[] = [];

  if (sales.productId && sales.priceKrw !== null) {
    const days = passDaysOf(sales.productId);
    const { original, badge } = formatSalesHeadline(sales);
    options.push({
      kind: 'fiveWeek',
      productId: sales.productId,
      days,
      title: '스위치온 패스',
      subtitle: '5주 · 한 회차 전체',
      price: formatKrw(sales.priceKrw),
      perWeek: `주당 ${formatKrw(Math.round(sales.priceKrw / (days / 7)))}`,
      original,
      badge,
      recommended: false,
    });
  }

  if (sales.weekPass) {
    options.push({
      kind: 'week',
      productId: sales.weekPass.productId,
      days: sales.weekPass.days,
      title: '1주 패스',
      subtitle: `${sales.weekPass.days}일 · 써 보거나 한 주 더 할 때`,
      price: formatKrw(sales.weekPass.priceKrw),
      perWeek: null,
      original: null,
      badge: null,
      recommended: false,
    });
  }

  if (options.length === 0 || programWeek === 'loading') return options;
  const preferWeek = programWeek !== null && programWeek >= WEEK_PASS_RECOMMENDED_FROM_WEEK;
  const recommended =
    options.find((o) => o.kind === (preferWeek ? 'week' : 'fiveWeek')) ?? options[0];
  recommended.recommended = true;
  return [recommended, ...options.filter((o) => o !== recommended)];
}

// 고른 상품. 고르지 않았거나 고른 상품이 목록에서 사라졌으면 첫 상품(추천 상품)
export function selectPassOption(
  options: PassOption[],
  selected: PassOptionKind | null
): PassOption | null {
  return options.find((o) => o.kind === selected) ?? options[0] ?? null;
}

// 결제 버튼을 누를 수 있는지. 주차를 모르는 동안(유저 불러오는 중) 기본 선택은 아직 추천이 아니므로 막고,
// 직접 고른 상품이면 그대로 살 수 있다
export function canPurchasePassSelection(
  programWeek: PassProgramWeek,
  selected: PassOptionKind | null
): boolean {
  return programWeek !== 'loading' || selected !== null;
}

export function getPassCtaLabel(option: PassOption, hasPass: boolean): string {
  if (hasPass) return `${option.price}으로 ${option.kind === 'week' ? '1주' : '5주'} 연장하기`;
  return `${option.price}으로 ${option.kind === 'week' ? '1주' : '한 회차'} 시작하기`;
}

// 1주 패스는 한 주 더 하기로 늘어나지 않는다
export function getRepeatWeekNote(option: PassOption): string | null {
  return option.kind === 'fiveWeek'
    ? `한 주 더 하면 패스도 한 주 늘어나요 (최대 ${FIVE_WEEK_MAX_EXTENSIONS}번)`
    : null;
}

// 패스 레시피 하루 한도 (quota_setting.pass_daily). 못 불러왔으면 줄을 숨긴다
export function getPassRecipeLine(passDaily: number | undefined): string | null {
  return passDaily === undefined ? null : `레시피 하루 ${passDaily}개, 광고 없이`;
}
