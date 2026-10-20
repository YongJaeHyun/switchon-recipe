/// <reference lib="deno.ns" />

// 엣지 함수에서 공유하는 환경변수 조회와 유저 JWT -> uid 조회 헬퍼.
// Deno 런타임에서만 쓰이므로 supabase-js를 URL import 해도 된다 (premium.ts와 달리 Vitest 대상이 아님).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const requireEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

// 요청의 Authorization 헤더(유저 JWT)로 uid를 구한다. 헤더가 없거나 유효하지 않으면 null.
export const getUid = async (req: Request): Promise<string | null> => {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;

  const userClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;
  return user.id;
};
