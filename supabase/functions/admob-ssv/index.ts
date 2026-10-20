/// <reference lib="deno.ns" />

// AdMob 보상형 광고 서버 측 확인(SSV) 콜백. 유저가 광고를 끝까지 보면 Google이 GET으로 호출하고,
// 서명을 검증한 뒤 grant_ad_bonus RPC로 오늘 레시피 생성 한도 +1을 지급한다.
// Google은 200이 아니면 계속 재시도하므로, 서명이 맞은 요청은 지급 결과와 무관하게 200을 돌려준다.
// 공개키 조회 실패만 500 (Google 재시도로 나중에 지급되도록). verify_jwt = false로 배포한다.
// 필요한 secret: ADMOB_REWARDED_AD_UNIT_IDS (쉼표 구분, 콜백 ad_unit 값 = 광고 단위 ID의 '/' 뒤 숫자)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import {
  createKeyFetcher,
  isAllowedAdUnit,
  parseSsvQuery,
  verifySsv,
} from '../_shared/admobSsv.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 유저 Authorization 헤더 없이 service role 키만 쓰는 클라이언트 (grant_ad_bonus는 service role 전용)
const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
const getKeys = createKeyFetcher();

// 감사용으로 콜백 쿼리 전체(서명 포함)를 디코딩해 그대로 남긴다
const toRaw = (rawQuery: string) => {
  const raw: Record<string, string> = {};
  new URLSearchParams(rawQuery).forEach((value, key) => {
    raw[key] = value;
  });
  return raw;
};

const text = (body: string, status: number) => new Response(body, { status });

serve(async (req: Request) => {
  if (req.method !== 'GET') return text('method not allowed', 405);

  // 서명 대상은 쿼리 원문이므로 디코딩/재조합하지 않고 그대로 넘긴다
  const rawQuery = new URL(req.url).search.slice(1);
  const parsed = parseSsvQuery(rawQuery);
  if (!parsed) return text('invalid signature', 400);

  let keys;
  try {
    keys = await getKeys();
    // 키 교체 직후라 캐시에 key_id가 없으면 한 번 새로 받아본다
    if (!keys.some((key) => key.keyId === parsed.params.keyId)) keys = await getKeys(true);
  } catch (error) {
    console.error('AdMob 공개키 조회 실패:', error);
    return text('key fetch failed', 500);
  }

  const params = await verifySsv(rawQuery, keys);
  if (!params) return text('invalid signature', 400);

  // 검증 키는 모든 AdMob 앱 공용이므로 우리 광고 단위(ADMOB_REWARDED_AD_UNIT_IDS)인지 확인한다.
  // 목록 밖이거나 env 미설정이면 지급하지 않는다 (재시도 무의미하므로 200)
  if (!isAllowedAdUnit(params.adUnit, Deno.env.get('ADMOB_REWARDED_AD_UNIT_IDS'))) {
    console.warn('AdMob SSV: 허용되지 않은 광고 단위라 지급하지 않음', {
      adUnit: params.adUnit,
      transactionId: params.transactionId,
    });
    return text('ok', 200);
  }

  // AdMob 콘솔의 '확인 URL' 테스트 요청 등 user_id가 없거나 uid가 아닌 경우는 기록하지 않는다
  if (!params.userId || !UUID_PATTERN.test(params.userId) || !params.transactionId) {
    console.log('AdMob SSV: 지급 대상 아님 (user_id/transaction_id 없음)', {
      userId: params.userId,
      transactionId: params.transactionId,
    });
    return text('ok', 200);
  }

  try {
    const { data, error } = await supabase.rpc('grant_ad_bonus', {
      p_uid: params.userId,
      p_transaction_id: params.transactionId,
      p_reward_amount: params.rewardAmount,
      p_ad_unit: params.adUnit,
      p_raw: toRaw(rawQuery),
    });
    if (error) {
      // 탈퇴한 유저(FK 위반) 등. 재시도해도 같은 결과라 200으로 끝낸다
      console.error('grant_ad_bonus 실패:', error, { transactionId: params.transactionId });
    } else {
      console.log('AdMob SSV 처리:', data, { transactionId: params.transactionId });
    }
  } catch (error) {
    console.error('grant_ad_bonus 호출 오류:', error, { transactionId: params.transactionId });
  }

  return text('ok', 200);
});
