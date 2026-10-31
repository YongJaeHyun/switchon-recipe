/// <reference lib="deno.ns" />

// 패스 상태 조회: 판매 구간(getSalesState), 패스 만료일, 그리고 서버 최종 판단인
// has_premium_access_for(uid) RPC 결과를 합쳐서 돌려준다. hasAccess는 여기서 다시 계산하지 않고
// DB 함수 결과를 그대로 전달한다 (서버 최종 판단은 단일 소스여야 하므로).
// foodCheckTrialRemaining: 패스 없이 쓸 수 있는 음식 판정 무료 횟수 (앱 표시용, food-check가 최종 판단)
// sales: 5주 패스 첫 구매 할인(2,900원)은 granted 5주 패스 구매가 없는 유저에게만 (운영자 결정 2026-11-01)
// recipeByNameTrialRemaining: 패스 없이 쓸 수 있는 음식 이름으로 만들기 무료 횟수 (앱 표시용, create-recipe-by-name이 최종 판단)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { foodCheckTrialRemaining, freeReportRemaining } from '../_shared/foodCheckTrial.ts';
import {
  getSalesState,
  hasUsedFirstPurchaseDiscount,
  type PremiumSetting,
  type PurchaseForExpiry,
} from '../_shared/pass.ts';
import { recipeByNameTrialRemaining } from '../_shared/recipeNameCheck.ts';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const getSetting = async (): Promise<PremiumSetting> => {
  const { data, error } = await supabase
    .from('premium_setting')
    .select('free_start, free_end')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return { freeStart: data?.free_start ?? null, freeEnd: data?.free_end ?? null };
};

const getPassExpiresAt = async (uid: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('user_pass')
    .select('pass_expires_at')
    .eq('uid', uid)
    .maybeSingle();
  if (error) throw error;
  return data?.pass_expires_at ?? null;
};

// 할인을 이미 썼는지. 조회가 실패하면 상태 전체를 실패시킨다: 할인을 쓴 유저에게 할인가를 보여 주면 결제 뒤 환불된다
const getDiscountUsed = async (uid: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('pass_purchase')
    .select('product_id, status')
    .eq('uid', uid);
  if (error) throw error;
  return hasUsedFirstPurchaseDiscount(
    (data as { product_id: string; status: PurchaseForExpiry['status'] }[]).map((row) => ({
      productId: row.product_id,
      status: row.status,
    }))
  );
};

const getHasAccess = async (uid: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('has_premium_access_for', { p_uid: uid });
  if (error) throw error;
  return data === true;
};

// 표시용이라 조회가 실패하면(마이그레이션 적용 전 등) 상태 전체를 실패시키지 않고 빈 값(undefined)으로 둔다. 앱은 모르는 값으로 보고 서버 판단에 맡긴다.
// select('*')라 recipe_by_name_used 열이 아직 없어도(마이그레이션 전) 음식 판정 횟수는 그대로 준다
const getTrialRemaining = async (
  uid: string
): Promise<{
  foodCheck: number | undefined;
  recipeByName: number | undefined;
  freeReport: number | undefined;
}> => {
  const { data, error } = await supabase
    .from('user_trial')
    .select('*')
    .eq('uid', uid)
    .maybeSingle();
  if (error) {
    console.error('무료 체험 조회 실패:', error);
    return { foodCheck: undefined, recipeByName: undefined, freeReport: undefined };
  }
  const row = (data ?? {}) as {
    food_check_used?: number;
    recipe_by_name_used?: number;
    free_report_at?: string | null;
  };
  return {
    foodCheck: foodCheckTrialRemaining(row.food_check_used),
    // 행은 있는데 열이 없으면(마이그레이션 전) 모르는 값
    recipeByName:
      data && row.recipe_by_name_used === undefined
        ? undefined
        : recipeByNameTrialRemaining(row.recipe_by_name_used),
    freeReport: freeReportRemaining(row.free_report_at),
  };
};

serve(async (req: Request) => {
  try {
    const uid = await getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    const now = new Date();
    const [setting, discountUsed, passExpiresAt, hasAccess, trial] = await Promise.all([
      getSetting(),
      getDiscountUsed(uid),
      getPassExpiresAt(uid),
      getHasAccess(uid),
      getTrialRemaining(uid),
    ]);

    return json(
      {
        sales: getSalesState(now, setting, { discountUsed }),
        passExpiresAt,
        hasAccess,
        foodCheckTrialRemaining: trial.foodCheck,
        recipeByNameTrialRemaining: trial.recipeByName,
        freeReportRemaining: trial.freeReport,
        serverNow: now.toISOString(),
      },
      200
    );
  } catch (error) {
    // 오류 상세(시크릿 포함 가능)는 로그에만 남기고 응답에는 담지 않는다
    console.error('패스 상태 조회 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
});
