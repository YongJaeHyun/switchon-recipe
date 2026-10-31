// 결제 화면에서 고를 수 있는 패스 상품(5주 패스·1주 패스)과 그 문구. 화면은 이 결과를 보여주기만 한다
import { passDaysOf, type SalesState } from 'types/pass';
import { formatKrw } from './passDisplay';

export type PassOptionKind = 'fiveWeek' | 'week';

export interface PassOption {
  kind: PassOptionKind;
  productId: string;
  days: number;
  title: string;
  subtitle: string;
  price: string; // "1,900원"
  perWeek: string | null; // "주당 380원" (5주 패스만)
  recommended: boolean;
}

// 한 주 더 하기로 늘어나는 횟수 상한 (서버 _shared/pass.ts FIVE_WEEK_MAX_EXTENSIONS와 같은 값)
const FIVE_WEEK_MAX_EXTENSIONS = 2;

// 프로그램이 한 주쯤 남은 4주차부터(유지기 포함)는 1주 패스를 추천한다 (운영자 결정 2026-10-31)
const WEEK_PASS_RECOMMENDED_FROM_WEEK = 4;

// 고를 수 있는 패스. 5주 패스(지금 가격 구간)와 1주 패스(판매 중일 때만), 추천 상품이 먼저.
// programWeek는 오늘의 프로그램 주차(5 = 유지기), 시작일을 모르면 null. 판매 중이 아니면 빈 목록
export function getPassOptions(sales: SalesState, programWeek: number | null): PassOption[] {
  if (!sales.onSale) return [];
  const options: PassOption[] = [];

  if (sales.productId && sales.priceKrw !== null) {
    const days = passDaysOf(sales.productId);
    options.push({
      kind: 'fiveWeek',
      productId: sales.productId,
      days,
      title: '스위치온 패스',
      subtitle: '5주 · 한 회차 전체',
      price: formatKrw(sales.priceKrw),
      perWeek: `주당 ${formatKrw(Math.round(sales.priceKrw / (days / 7)))}`,
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
      recommended: false,
    });
  }

  if (options.length === 0) return options;
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
