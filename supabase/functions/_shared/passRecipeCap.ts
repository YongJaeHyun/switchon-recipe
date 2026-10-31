// 패스당 레시피 총량 (운영자 결정 2026-11-01: 원가 때문에 한 패스로 만들 수 있는 레시피 수를 정한다).
// 실제 판단은 DB(consume_recipe_quota·get_recipe_quota·grant_ad_bonus가 부르는 pass_recipe_period,
// 마이그레이션 20261101050000_pass_recipe_cap_and_ai_usage.sql)가 하고, 이 파일은 같은 규칙의 TS 사본이다
// (규칙을 테스트로 고정하려고 둔다. 바꾸면 SQL도 같이 바꾼다).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다 (pass.ts는 같은 조건).
//
// 정의
// - "이번 패스 기간": granted 구매와 한 주 더 하기 연장을 시간 순으로 쌓아(computeExpiry와 같은 규칙) 만든,
//   지금 시각까지 끊기지 않고 이어지는 패스 구간. 시작 = 그 구간을 연 구매의 구매 시각.
//   패스가 남아 있을 때 산 구매는 구간을 잇고(시작 그대로), 패스가 끝난 뒤 산 구매는 새 구간을 연다(만든 수 초기화).
// - 총량: 구간 안 구매마다 5주 패스 fiveWeekTotal(150), 1주 패스 perWeek(30). 유효한 연장(computeExpiry가
//   7일을 더한 것)마다 perWeek(30). 값은 quota_setting(pass_recipe_total, pass_recipe_per_week)에서 바꾼다.
// - 만든 수(DB): recipe_usage.used를 구간 시작일(KST 날짜)부터 오늘까지 더한 값. 재료로 만들기·이름으로 만들기가
//   모두 consume_recipe_quota로 차감하므로 둘 다 센다. 생성 실패로 되돌린 수는 빠지고, 진행 중인 요청은 들어간다
//   (그래서 동시 요청으로 총량을 넘지 않는다). 날짜 단위라 구간을 연 날 구매 전에 무료로 만든 수도 들어간다(최대 하루 무료+광고 수).
// - 총량을 다 쓰면 레시피 만들기는 무료 이용자와 같다(무료 하루 수 + 광고 보상). 다른 패스 기능은 그대로다.
// - 구간을 못 만들면(구매 기록 없이 user_pass만 있는 경우 등) 총량 제한을 두지 않는다.

import {
  type ExtensionForExpiry,
  FIVE_WEEK_MAX_EXTENSIONS,
  PASS_DAYS,
  PASS_EXTENSION_DAYS,
  passProductOf,
  type PurchaseForExpiry,
  WEEK_PASS_PRODUCT,
} from './pass.ts';

export interface PassRecipeCapSetting {
  // 5주 패스 하나로 만들 수 있는 레시피 수
  fiveWeekTotal: number;
  // 1주 패스 하나, 한 주 더 하기 연장 한 번마다 더하는 수
  perWeek: number;
}

// 마이그레이션 기본값과 같다
export const DEFAULT_PASS_RECIPE_CAP_SETTING: PassRecipeCapSetting = {
  fiveWeekTotal: 150,
  perWeek: 30,
};

export interface PassRecipePeriod {
  start: Date;
  cap: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const capOfProduct = (productId: string, setting: PassRecipeCapSetting) =>
  productId === WEEK_PASS_PRODUCT.productId ? setting.perWeek : setting.fiveWeekTotal;

// 지금(now) 이어지고 있는 패스 구간의 시작과 레시피 총량. 지금 패스가 없으면 null
export function passRecipePeriod(
  purchases: PurchaseForExpiry[],
  extensions: ExtensionForExpiry[],
  now: Date,
  setting: PassRecipeCapSetting
): PassRecipePeriod | null {
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

  const remaining = new Map<string, number>();
  let expiry: number | null = null;
  let start = 0;
  let cap = 0;
  for (const event of events) {
    if (event.kind === 'extension') {
      const left = remaining.get(event.token) ?? 0;
      if (left <= 0 || expiry === null || expiry <= event.at) continue;
      remaining.set(event.token, left - 1);
      expiry += PASS_EXTENSION_DAYS * DAY_MS;
      cap += setting.perWeek;
      continue;
    }
    const product = passProductOf(event.productId);
    if (expiry === null || expiry <= event.at) {
      // 패스가 끝난 뒤(또는 처음) 산 구매: 새 구간
      start = event.at;
      cap = 0;
      expiry = event.at;
    }
    expiry += (product?.days ?? PASS_DAYS) * DAY_MS;
    cap += capOfProduct(event.productId, setting);
    remaining.set(event.token, product?.maxExtensions ?? FIVE_WEEK_MAX_EXTENSIONS);
  }

  if (expiry === null || expiry <= now.getTime()) return null;
  return { start: new Date(start), cap };
}

export interface PassRecipeCapState {
  capReached: boolean;
  // 이번 구간 총량. 구간을 모르면 null (제한 없음)
  totalLimit: number | null;
  totalRemaining: number | null;
}

// used: 이번 구간에 만든 수 (DB에서는 recipe_usage.used 합)
export function passRecipeCapState(
  period: PassRecipePeriod | null,
  used: number
): PassRecipeCapState {
  if (!period) return { capReached: false, totalLimit: null, totalRemaining: null };
  return {
    capReached: used >= period.cap,
    totalLimit: period.cap,
    totalRemaining: Math.max(period.cap - used, 0),
  };
}
