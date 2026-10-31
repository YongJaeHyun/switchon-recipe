-- 패스당 레시피 총량 + Gemini 실제 사용량 기록 (운영자 결정 2026-11-01, 원가 분석: 레시피 1개 ≈ 60원, 패스 순수익 ≈ 3,790원)
--
-- (A) 패스당 레시피 총량
--   한 패스 기간에 만들 수 있는 레시피 수를 정한다 (하루 pass_daily(20)는 그대로 함께 적용).
--   - quota_setting.pass_recipe_total (기본 150): 5주 패스 하나로 만들 수 있는 수
--   - quota_setting.pass_recipe_per_week (기본 30): 한 주 더 하기 연장 한 번, 1주 패스 하나마다 더하는 수
--   - "이번 패스 기간"(pass_recipe_period): granted 구매와 pass_extension을 시간 순으로 쌓아(_shared/pass.ts
--     computeExpiry와 같은 규칙) 지금까지 끊기지 않고 이어지는 구간. 시작 = 그 구간을 연 구매의 구매 시각.
--     패스가 남아 있을 때 산 구매는 구간을 잇고 총량을 더하며, 패스가 끝난 뒤 산 구매는 새 구간을 열어 만든 수를 초기화한다.
--     같은 규칙의 TS 사본과 테스트: supabase/functions/_shared/passRecipeCap.ts, tests/quota/passRecipeCap.test.ts
--   - 만든 수: recipe_usage.used를 구간 시작일(KST 날짜)부터 더한 값. 재료로 만들기(create-recipe-by-gemini)와
--     이름으로 만들기(create-recipe-by-name)가 모두 consume_recipe_quota로 차감하므로 둘 다 센다. 생성 실패로
--     되돌린 수는 빠지고 진행 중인 요청은 들어가므로 동시 요청으로 총량을 넘지 않는다(오늘 행을 잠근 뒤 센다).
--     날짜 단위라 구간을 연 날 구매 전에 무료로 만든 수(최대 free_daily + 광고 보상)도 들어간다.
--   - 총량을 다 쓰면 레시피 만들기만 무료 이용자와 같다: isPass=false, 무료 하루 수 + 광고 보상(grant_ad_bonus도 허용).
--     오늘 이미 무료 한도보다 많이 만들었으면 오늘은 더 못 만들고 내일부터 무료 수로 만든다.
--   - 구간을 만들 수 없으면(구매 기록 없이 user_pass만 있는 경우 등) 총량 제한을 두지 않는다 (예전과 같음).
--   - 응답은 기존 키를 그대로 두고 키만 더한다 (5.x 앱 호환):
--     consume_recipe_quota: passCapReached, passTotalLimit, passTotalRemaining
--     get_recipe_quota:     hasPass, passCapReached, passTotalLimit, passTotalRemaining
--     isPass는 "패스 한도로 센다"는 뜻이 되어 총량을 다 쓴 패스 이용자는 false (5.x는 무료 창·광고 버튼을 보여준다).
--     패스 이용자의 remaining은 오늘 남은 수와 이번 패스 남은 총량 중 작은 값. 무료 이용자는 전과 같다.
--
-- (B) ai_usage: Gemini 호출 한 번에 한 행 (_shared/aiUsage.ts가 백그라운드로 넣는다). service role만 쓰고 읽는다.
--     ai_usage_cost(p_from, p_to, p_krw_per_usd): 기능·모델·날짜별 원화 비용 (docs/ai-usage.md)
--
-- 배포 순서: 이 마이그레이션 → Gemini를 부르는 엣지 함수들 재배포(사용량 기록) → 앱.
-- 총량 판단은 DB 함수만 바꾸므로 마이그레이션만으로 적용된다(엣지 함수 배포 전에도). 엣지 함수가 먼저 배포돼도
-- ai_usage insert가 실패해 로그만 남고 유저 요청은 그대로다.

-- ---------------------------------------------------------------------------
-- (A) 패스당 레시피 총량
-- ---------------------------------------------------------------------------

alter table public.quota_setting
  add column if not exists pass_recipe_total integer not null default 150
    check (pass_recipe_total >= 0),
  add column if not exists pass_recipe_per_week integer not null default 30
    check (pass_recipe_per_week >= 0);

-- 지금 이어지는 패스 구간의 시작과 레시피 총량. 지금 패스가 없으면 행 없음. service role·definer 함수 전용
-- 상품 일수·연장 상한은 extend_pass_for_week_repeat·_shared/pass.ts와 같다: 1주 패스 7일·0번, 그 밖(5주)은 35일·2번
create or replace function public.pass_recipe_period(p_uid uuid, p_total integer, p_per_week integer)
returns table (period_start timestamptz, recipe_cap integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_tokens text[] := '{}';
  v_left int[] := '{}';
  v_n int := 0;
  v_expiry timestamptz;
  v_start timestamptz;
  v_cap int := 0;
  i int;
begin
  for r in
    select 0 as kind, p.purchase_token as token, p.product_id, p.purchased_at as ev_at
    from public.pass_purchase p
    where p.uid = p_uid
      and p.status = 'granted'
    union all
    select 1, e.purchase_token, null::text, e.extended_at
    from public.pass_extension e
    where e.uid = p_uid
    order by ev_at, kind
  loop
    if r.kind = 0 then
      -- 패스가 끝난 뒤(또는 처음) 산 구매는 새 구간
      if v_expiry is null or v_expiry <= r.ev_at then
        v_start := r.ev_at;
        v_cap := 0;
        v_expiry := r.ev_at;
      end if;
      v_expiry := v_expiry
        + case when r.product_id = 'switchon_pass_1w_1500' then interval '7 days' else interval '35 days' end;
      v_cap := v_cap
        + case when r.product_id = 'switchon_pass_1w_1500' then p_per_week else p_total end;
      i := array_position(v_tokens, r.token);
      if i is null then
        v_n := v_n + 1;
        v_tokens[v_n] := r.token;
        i := v_n;
      end if;
      v_left[i] := case when r.product_id = 'switchon_pass_1w_1500' then 0 else 2 end;
    else
      -- 연장: 묶인 구매가 이미 쌓였고 상한이 남았고 그 시각에 패스가 남아 있을 때만 +7일, +p_per_week
      i := array_position(v_tokens, r.token);
      if i is null or v_left[i] <= 0 or v_expiry is null or v_expiry <= r.ev_at then
        continue;
      end if;
      v_left[i] := v_left[i] - 1;
      v_expiry := v_expiry + interval '7 days';
      v_cap := v_cap + p_per_week;
    end if;
  end loop;

  if v_expiry is null or v_expiry <= now() then
    return;
  end if;

  period_start := v_start;
  recipe_cap := v_cap;
  return next;
end;
$$;

revoke all on function public.pass_recipe_period(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.pass_recipe_period(uuid, integer, integer) to service_role;

-- 패스 여부와 이번 패스 총량 상태 (행 하나). 패스가 없거나 구간을 모르면 cap_reached=false, total_* = null.
-- consume_recipe_quota는 오늘 recipe_usage 행을 잠근 뒤 불러야 진행 중인 차감까지 센다. service role·definer 함수 전용
create or replace function public.pass_recipe_cap_state(p_uid uuid)
returns table (has_pass boolean, cap_reached boolean, total_limit integer, total_remaining integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_per_week integer;
  v_start timestamptz;
  v_cap integer;
  v_used integer;
begin
  has_pass := exists (
    select 1
    from public.user_pass
    where uid = p_uid
      and pass_expires_at > now()
  );
  cap_reached := false;
  total_limit := null;
  total_remaining := null;

  if has_pass then
    select qs.pass_recipe_total, qs.pass_recipe_per_week
      into v_total, v_per_week
    from public.quota_setting qs
    where qs.id = 1;

    select pr.period_start, pr.recipe_cap
      into v_start, v_cap
    from public.pass_recipe_period(p_uid, v_total, v_per_week) pr;

    if v_start is not null and v_cap is not null then
      select coalesce(sum(ru.used), 0)::integer
        into v_used
      from public.recipe_usage ru
      where ru.uid = p_uid
        and ru.day >= (v_start at time zone 'Asia/Seoul')::date;

      total_limit := v_cap;
      total_remaining := greatest(v_cap - v_used, 0);
      cap_reached := v_used >= v_cap;
    end if;
  end if;

  return next;
end;
$$;

revoke all on function public.pass_recipe_cap_state(uuid) from public, anon, authenticated;
grant execute on function public.pass_recipe_cap_state(uuid) to service_role;

-- 레시피 1개 생성분을 차감 (서버 최종 판단용). 20261020120000_recipe_quota.sql 본문에 패스 총량을 더했다.
-- 유저의 오늘 행을 잠가 동시 요청에도 한도를 넘지 않게 한다. service role 전용
create or replace function public.consume_recipe_quota(p_uid uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_setting public.quota_setting%rowtype;
  v_pass record;
  v_is_pass boolean;
  v_used integer;
  v_ad_bonus integer;
  v_limit integer;
  v_allowed boolean;
  v_remaining integer;
  v_total_remaining integer;
begin
  select * into v_setting from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  insert into public.recipe_usage (uid, day)
  values (p_uid, v_day)
  on conflict (uid, day) do nothing;

  select ru.used, ru.ad_bonus
    into v_used, v_ad_bonus
  from public.recipe_usage ru
  where ru.uid = p_uid
    and ru.day = v_day
  for update;

  -- 오늘 행을 잠근 뒤 세야 같은 유저의 동시 요청이 총량을 넘지 않는다
  select * into v_pass from public.pass_recipe_cap_state(p_uid);
  -- 패스 한도로 세는지: 패스가 있고 이번 패스 총량이 남았을 때만
  v_is_pass := v_pass.has_pass and not v_pass.cap_reached;

  v_limit := case when v_is_pass then v_setting.pass_daily
                  else v_setting.free_daily + v_ad_bonus end;
  v_allowed := v_used < v_limit;

  if v_allowed then
    update public.recipe_usage
      set used = used + 1
    where uid = p_uid
      and day = v_day;
    v_used := v_used + 1;
  end if;

  v_total_remaining := case
    when v_pass.total_remaining is null then null
    when v_allowed then greatest(v_pass.total_remaining - 1, 0)
    else v_pass.total_remaining end;

  v_remaining := greatest(v_limit - v_used, 0);
  if v_is_pass and v_total_remaining is not null then
    v_remaining := least(v_remaining, v_total_remaining);
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'limit', v_limit,
    'isPass', v_is_pass,
    -- 광고 1개로 실제로 1개를 더 만들 수 있을 때만 (패스 만료·설정 변경으로 used가 한도보다 많이 앞선 경우 제외)
    'canWatchAd', (not v_is_pass) and v_ad_bonus < v_setting.ad_bonus_daily
                  and v_used < v_setting.free_daily + v_ad_bonus + 1,
    -- 패스가 있는데 이번 패스 총량을 다 써서 무료처럼 센 경우 true
    'passCapReached', v_pass.has_pass and v_pass.cap_reached,
    'passTotalLimit', v_pass.total_limit,
    'passTotalRemaining', v_total_remaining
  );
end;
$$;

revoke all on function public.consume_recipe_quota(uuid) from public, anon, authenticated;

-- 보상형 광고 SSV 검증 후 오늘 보너스 1개 지급. 20261020120000_recipe_quota.sql 본문에서
-- "패스 구매자는 대상 아님"을 "패스 한도로 세는 동안은 대상 아님"으로 바꿨다 (총량을 다 쓴 패스 이용자는 광고 보상을 받는다).
-- 반환: 'granted' | 'duplicate' | 'limit' | 'pass'. service role 전용
create or replace function public.grant_ad_bonus(
  p_uid uuid,
  p_transaction_id text,
  p_reward_amount integer,
  p_ad_unit text,
  p_raw jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_ad_bonus_daily integer;
  v_ad_bonus integer;
begin
  insert into public.ad_reward (transaction_id, uid, reward_amount, ad_unit, raw)
  values (p_transaction_id, p_uid, p_reward_amount, p_ad_unit, p_raw)
  on conflict (transaction_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  -- 패스 한도로 세는 동안은 광고 보너스 대상이 아님 (기록만 남긴다)
  if exists (
    select 1
    from public.pass_recipe_cap_state(p_uid) s
    where s.has_pass
      and not s.cap_reached
  ) then
    return 'pass';
  end if;

  select ad_bonus_daily into v_ad_bonus_daily from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  insert into public.recipe_usage (uid, day)
  values (p_uid, v_day)
  on conflict (uid, day) do nothing;

  select ru.ad_bonus
    into v_ad_bonus
  from public.recipe_usage ru
  where ru.uid = p_uid
    and ru.day = v_day
  for update;

  if v_ad_bonus < v_ad_bonus_daily then
    update public.recipe_usage
      set ad_bonus = ad_bonus + 1
    where uid = p_uid
      and day = v_day;
    return 'granted';
  end if;

  return 'limit';
end;
$$;

revoke all on function public.grant_ad_bonus(uuid, text, integer, text, jsonb) from public, anon, authenticated;

-- 로그인한 본인 기준 오늘 레시피 생성 한도 조회 (행을 만들지 않는다).
-- 20261020130000_recipe_quota_daily_limit.sql 본문에 패스 총량을 더했다 (기존 키 그대로, 키만 추가)
create or replace function public.get_recipe_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_setting public.quota_setting%rowtype;
  v_pass record;
  v_is_pass boolean;
  v_used integer := 0;
  v_ad_bonus integer := 0;
  v_limit integer;
  v_remaining integer;
begin
  select * into v_setting from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  select * into v_pass from public.pass_recipe_cap_state(v_uid);
  v_is_pass := v_pass.has_pass and not v_pass.cap_reached;

  select ru.used, ru.ad_bonus
    into v_used, v_ad_bonus
  from public.recipe_usage ru
  where ru.uid = v_uid
    and ru.day = v_day;

  if not found then
    v_used := 0;
    v_ad_bonus := 0;
  end if;

  v_limit := case when v_is_pass then v_setting.pass_daily
                  else v_setting.free_daily + v_ad_bonus end;

  v_remaining := greatest(v_limit - v_used, 0);
  if v_is_pass and v_pass.total_remaining is not null then
    v_remaining := least(v_remaining, v_pass.total_remaining);
  end if;

  return jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', v_remaining,
    'adBonusLeft', case when v_is_pass then 0
                        when v_used >= v_setting.free_daily + v_ad_bonus + 1 then 0
                        else greatest(v_setting.ad_bonus_daily - v_ad_bonus, 0) end,
    -- 패스 한도로 세는지 (패스가 있어도 이번 패스 총량을 다 썼으면 false)
    'isPass', v_is_pass,
    -- 화면에 보여줄 기본 하루 한도 (광고 보상은 포함하지 않음: 패스 한도면 pass_daily, 아니면 free_daily)
    'dailyLimit', case when v_is_pass then v_setting.pass_daily else v_setting.free_daily end,
    -- 패스가 있는지 (총량과 무관)
    'hasPass', v_pass.has_pass,
    'passCapReached', v_pass.has_pass and v_pass.cap_reached,
    -- 이번 패스 기간 총량과 남은 수. 패스가 없거나 구간을 모르면 null
    'passTotalLimit', v_pass.total_limit,
    'passTotalRemaining', v_pass.total_remaining
  );
end;
$$;

revoke all on function public.get_recipe_quota() from public, anon, authenticated;
grant execute on function public.get_recipe_quota() to authenticated;

-- ---------------------------------------------------------------------------
-- (B) Gemini 실제 사용량
-- ---------------------------------------------------------------------------

-- Gemini 호출 한 번 = 한 행. uid는 요청한 유저(cron·백필은 null). 유저 삭제와 무관하게 비용 기록으로 남긴다(FK 없음).
-- output_tokens는 텍스트 출력만(생각·이미지 토큰 제외), image_count는 응답 이미지 장수
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  uid uuid null,
  feature text not null,
  model text not null default '',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thinking_tokens integer not null default 0 check (thinking_tokens >= 0),
  image_tokens integer not null default 0 check (image_tokens >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  ok boolean not null,
  status integer null
);

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at);
create index if not exists ai_usage_feature_created_at_idx on public.ai_usage (feature, created_at);

-- RLS 켜고 정책 없음: service role(엣지 함수)만 넣고 읽는다
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from public, anon, authenticated;
grant select, insert on table public.ai_usage to service_role;

-- 기간(KST 날짜, 양끝 포함)의 날짜·기능·모델별 호출 수와 비용. 단가는 2026-11 공식 가격(USD / 1M 토큰, 이미지 장당):
--   gemini-2.5-flash             입력 0.30, 출력 2.50 (생각 토큰 포함)
--   gemini-2.5-flash-lite        입력 0.10, 출력 0.40
--   gemini-3.1-flash-lite-image  입력 0.25, 텍스트 출력 1.50, 이미지 0.0336/장(1K)
-- 표에 없는 모델은 usd·krw가 null (단가를 더해야 한다는 표시). 구글 검색 그라운딩 요금은 넣지 않는다.
-- service role 전용 (SQL 편집기에서 select * from public.ai_usage_cost('2026-11-01', '2026-11-30');)
create or replace function public.ai_usage_cost(
  p_from date,
  p_to date,
  p_krw_per_usd numeric default 1400
)
returns table (
  day date,
  feature text,
  model text,
  calls bigint,
  failed bigint,
  input_tokens bigint,
  output_tokens bigint,
  thinking_tokens bigint,
  image_count bigint,
  usd numeric,
  krw numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with price (model, in_per_m, out_per_m, per_image) as (
    values
      ('gemini-2.5-flash', 0.30::numeric, 2.50::numeric, 0::numeric),
      ('gemini-2.5-flash-lite', 0.10, 0.40, 0),
      ('gemini-3.1-flash-lite-image', 0.25, 1.50, 0.0336)
  ),
  daily as (
    select (u.created_at at time zone 'Asia/Seoul')::date as day,
           u.feature,
           u.model,
           count(*) as calls,
           count(*) filter (where not u.ok) as failed,
           sum(u.input_tokens)::bigint as input_tokens,
           sum(u.output_tokens)::bigint as output_tokens,
           sum(u.thinking_tokens)::bigint as thinking_tokens,
           sum(u.image_count)::bigint as image_count
    from public.ai_usage u
    where u.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')
      and u.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul')
    group by 1, 2, 3
  )
  select us.day,
         us.feature,
         us.model,
         us.calls,
         us.failed,
         us.input_tokens,
         us.output_tokens,
         us.thinking_tokens,
         us.image_count,
         round(us.input_tokens * p.in_per_m / 1000000
               + (us.output_tokens + us.thinking_tokens) * p.out_per_m / 1000000
               + us.image_count * p.per_image, 6) as usd,
         round((us.input_tokens * p.in_per_m / 1000000
               + (us.output_tokens + us.thinking_tokens) * p.out_per_m / 1000000
               + us.image_count * p.per_image) * p_krw_per_usd, 1) as krw
  from daily us
  left join price p on p.model = us.model
  order by us.day, us.feature, us.model;
$$;

revoke all on function public.ai_usage_cost(date, date, numeric) from public, anon, authenticated;
grant execute on function public.ai_usage_cost(date, date, numeric) to service_role;

-- PostgREST가 새 열·함수를 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
