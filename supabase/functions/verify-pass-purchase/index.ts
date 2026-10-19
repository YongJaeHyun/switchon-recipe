/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { createGooglePlayClient, type ServiceAccount } from '../_shared/googlePlay.ts';
import type { PurchaseForExpiry } from '../_shared/pass.ts';
import { type PurchaseRow, type VerifyDeps, verifyPurchase } from './handler.ts';

const UNIQUE_VIOLATION = '23505';

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

const deps = (): VerifyDeps => ({
  now: () => new Date(),

  async getSetting() {
    const { data, error } = await supabase
      .from('premium_setting')
      .select('free_start, free_end')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    return { freeStart: data?.free_start ?? null, freeEnd: data?.free_end ?? null };
  },

  async findPurchase(token: string) {
    const { data, error } = await supabase
      .from('pass_purchase')
      .select('status')
      .eq('purchase_token', token)
      .maybeSingle();
    if (error) throw error;
    return data;
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

  async insertPurchase(row: PurchaseRow) {
    const { error } = await supabase.from('pass_purchase').insert({
      uid: row.uid,
      product_id: row.productId,
      purchase_token: row.purchaseToken,
      order_id: row.orderId,
      price_krw: row.priceKrw,
      purchased_at: row.purchasedAt.toISOString(),
      granted_from: row.grantedFrom?.toISOString() ?? null,
      granted_until: row.grantedUntil?.toISOString() ?? null,
      status: row.status,
      raw: row.raw,
    });
    if (!error) return 'inserted';
    if (error.code === UNIQUE_VIOLATION) return 'duplicate';
    throw error;
  },

  async raisePassExpiry(uid: string, expiresAt: Date) {
    const { data, error } = await supabase.rpc('raise_pass_expiry', {
      p_uid: uid,
      p_expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    return new Date(data as string);
  },

  play: getPlayClient(),
});

const parseBody = async (
  req: Request
): Promise<{ productId: string; purchaseToken: string } | null> => {
  try {
    const body = await req.json();
    const { productId, purchaseToken } = body ?? {};
    if (typeof productId !== 'string' || !productId) return null;
    if (typeof purchaseToken !== 'string' || !purchaseToken) return null;
    return { productId, purchaseToken };
  } catch {
    return null;
  }
};

serve(async (req: Request) => {
  try {
    const uid = await getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    const body = await parseBody(req);
    if (!body) return json({ error: 'invalid request body' }, 400);

    const result = await verifyPurchase(deps(), { uid, ...body });
    return json(result, 200);
  } catch (error) {
    // 오류 상세(시크릿 포함 가능)는 로그에만 남기고 응답에는 담지 않는다
    console.error('패스 구매 검증 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
});
