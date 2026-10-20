/// <reference lib="deno.ns" />

// 패스 상태 조회: 판매 구간(getSalesState), 패스 만료일, 그리고 서버 최종 판단인
// has_premium_access_for(uid) RPC 결과를 합쳐서 돌려준다. hasAccess는 여기서 다시 계산하지 않고
// DB 함수 결과를 그대로 전달한다 (서버 최종 판단은 단일 소스여야 하므로).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { getSalesState, type PremiumSetting } from '../_shared/pass.ts';

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

const getHasAccess = async (uid: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('has_premium_access_for', { p_uid: uid });
  if (error) throw error;
  return data === true;
};

serve(async (req: Request) => {
  try {
    const uid = await getUid(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    const now = new Date();
    const [setting, passExpiresAt, hasAccess] = await Promise.all([
      getSetting(),
      getPassExpiresAt(uid),
      getHasAccess(uid),
    ]);

    return json(
      {
        sales: getSalesState(now, setting),
        passExpiresAt,
        hasAccess,
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
