/// <reference lib="deno.ns" />

// 환불된 패스 구매 회수 배치: cron 등 service role 호출로만 실행한다 (스펙 4.4).
// 최근 7일 안에 Play가 보고한 무효화 구매를 가져와 pass_purchase를 voided로 표시하고
// 영향받은 유저의 패스 만료일을 정확한 값으로 다시 쓴다 (환불이므로 낮추거나 없앨 수 있어야 함).
// 재실행은 idempotent하므로(이미 voided인 토큰도 유저 재계산은 항상 다시 함) 넓게 잡아
// 며칠치 cron 실패도 다음 실행에서 복구되게 한다.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { createGooglePlayClient, type ServiceAccount } from '../_shared/googlePlay.ts';
import type { PurchaseForExpiry } from '../_shared/pass.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
import { syncVoided, type VoidedDeps } from './handler.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 7 * DAY_MS;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// 액세스 토큰 캐시를 재사용하도록 처음 쓸 때 한 번만 만든다
let playClient: ReturnType<typeof createGooglePlayClient> | null = null;
const getPlayClient = () => {
  if (!playClient) {
    const sa = JSON.parse(requireEnv('GOOGLE_PLAY_SERVICE_ACCOUNT')) as ServiceAccount;
    playClient = createGooglePlayClient(sa, requireEnv('ANDROID_PACKAGE_NAME'));
  }
  return playClient;
};

const deps = (): VoidedDeps => ({
  async listVoided(sinceMillis: number) {
    return getPlayClient().listVoidedPurchases(sinceMillis);
  },

  async findPurchasesByTokens(tokens: string[]) {
    const { data, error } = await supabase
      .from('pass_purchase')
      .select('purchase_token, uid, status')
      .in('purchase_token', tokens);
    if (error) throw error;
    return data.map((row: { purchase_token: string; uid: string | null; status: string }) => ({
      purchaseToken: row.purchase_token,
      uid: row.uid,
      status: row.status,
    }));
  },

  async markVoided(tokens: string[]) {
    const { error } = await supabase
      .from('pass_purchase')
      .update({ status: 'voided' })
      .in('purchase_token', tokens);
    if (error) throw error;
  },

  async listUserPurchases(uid: string): Promise<PurchaseForExpiry[]> {
    const { data, error } = await supabase
      .from('pass_purchase')
      .select('purchased_at, status')
      .eq('uid', uid);
    if (error) throw error;
    return data.map((row: { purchased_at: string; status: PurchaseForExpiry['status'] }) => ({
      purchasedAt: new Date(row.purchased_at),
      status: row.status,
    }));
  },

  // raise_pass_expiry와 달리 정확한 값으로 쓴다: 환불로 만료일이 줄거나 패스 자체가 없어질 수 있다
  async setPassExpiry(uid: string, expiresAt: Date | null) {
    if (expiresAt === null) {
      const { error } = await supabase.from('user_pass').delete().eq('uid', uid);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from('user_pass').upsert({
      uid,
      pass_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
});

serve(async (req: Request) => {
  try {
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }

    const sinceMillis = Date.now() - LOOKBACK_MS;
    const result = await syncVoided(deps(), sinceMillis);
    return json(result, 200);
  } catch (error) {
    // 오류 상세(시크릿 포함 가능)는 로그에만 남기고 응답에는 담지 않는다
    console.error('환불된 패스 회수 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
});
