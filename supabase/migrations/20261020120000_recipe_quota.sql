-- 레시피 생성 한도: 하루 생성 수 설정, 유저별 오늘 사용량, 보상형 광고 지급 기록, 한도 함수
-- 하루 경계는 KST 자정 ((now() at time zone 'Asia/Seoul')::date)
-- 패스 구매자 = user_pass.pass_expires_at > now() (무료 기간은 레시피 한도와 무관하므로 has_premium_access_for를 쓰지 않는다)

create table public.quota_setting (
  id smallint primary key default 1 check (id = 1),
  free_daily integer not null default 5 check (free_daily >= 0),
  pass_daily integer not null default 20 check (pass_daily >= 0),
  ad_bonus_daily integer not null default 3 check (ad_bonus_daily >= 0)
);

insert into public.quota_setting (id, free_daily, pass_daily, ad_bonus_daily)
values (1, 5, 20, 3);

create table public.recipe_usage (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  ad_bonus integer not null default 0 check (ad_bonus >= 0),
  primary key (uid, day)
);

create table public.ad_reward (
  transaction_id text primary key,
  uid uuid references public.user (id) on delete set null,
  reward_amount integer,
  ad_unit text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index ad_reward_uid_created_at_idx on public.ad_reward (uid, created_at);

-- 레시피 1개 생성분을 차감 (서버 최종 판단용). 유저의 오늘 행을 잠가 동시 요청에도 한도를 넘지 않게 한다. service role 전용
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
  v_is_pass boolean;
  v_used integer;
  v_ad_bonus integer;
  v_limit integer;
  v_allowed boolean;
begin
  select * into v_setting from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  v_is_pass := exists (
    select 1
    from public.user_pass
    where uid = p_uid
      and pass_expires_at > now()
  );

  insert into public.recipe_usage (uid, day)
  values (p_uid, v_day)
  on conflict (uid, day) do nothing;

  select ru.used, ru.ad_bonus
    into v_used, v_ad_bonus
  from public.recipe_usage ru
  where ru.uid = p_uid
    and ru.day = v_day
  for update;

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

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', greatest(v_limit - v_used, 0),
    'limit', v_limit,
    'isPass', v_is_pass,
    'canWatchAd', (not v_is_pass) and v_ad_bonus < v_setting.ad_bonus_daily
  );
end;
$$;

revoke all on function public.consume_recipe_quota(uuid) from public, anon, authenticated;

-- 생성 실패 시 오늘 차감을 되돌린다 (0 미만 금지). service role 전용
create or replace function public.release_recipe_quota(p_uid uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.recipe_usage
    set used = greatest(used - 1, 0)
  where uid = p_uid
    and day = (now() at time zone 'Asia/Seoul')::date;
$$;

revoke all on function public.release_recipe_quota(uuid) from public, anon, authenticated;

-- 보상형 광고 SSV 검증 후 오늘 보너스 1개 지급. 같은 transaction_id는 한 번만. service role 전용
-- 반환: 'granted' | 'duplicate' | 'limit' | 'pass'
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

  -- 패스 구매자는 광고 보너스 대상이 아님 (기록만 남긴다)
  if exists (
    select 1
    from public.user_pass
    where uid = p_uid
      and pass_expires_at > now()
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

-- 로그인한 본인 기준 오늘 레시피 생성 한도 조회 (행을 만들지 않는다)
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
  v_is_pass boolean;
  v_used integer := 0;
  v_ad_bonus integer := 0;
  v_limit integer;
begin
  select * into v_setting from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  v_is_pass := exists (
    select 1
    from public.user_pass
    where uid = v_uid
      and pass_expires_at > now()
  );

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

  return jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'adBonusLeft', case when v_is_pass then 0
                        else greatest(v_setting.ad_bonus_daily - v_ad_bonus, 0) end,
    'isPass', v_is_pass
  );
end;
$$;

revoke all on function public.get_recipe_quota() from public, anon, authenticated;
grant execute on function public.get_recipe_quota() to authenticated;

alter table public.quota_setting enable row level security;
alter table public.recipe_usage enable row level security;
alter table public.ad_reward enable row level security;

create policy "레시피 한도 설정은 누구나 조회"
  on public.quota_setting for select
  to anon, authenticated
  using (true);

-- recipe_usage, ad_reward: RLS 켜고 정책 없음 (service role과 security definer 함수만 접근)
