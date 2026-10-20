-- 구독 기능 공통: 기능별 하루 한도 + 편의점 판정 기록 + 이미지 저장소
-- 하루 경계는 KST 자정 ((now() at time zone 'Asia/Seoul')::date)

create table public.premium_quota_setting (
  feature text primary key,
  daily integer not null check (daily >= 0)
);

insert into public.premium_quota_setting (feature, daily)
values ('food_check', 30);

create table public.premium_usage (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  feature text not null,
  used integer not null default 0 check (used >= 0),
  primary key (uid, day, feature)
);

-- 기능 1회분을 차감 (서버 최종 판단용). 오늘 행을 잠가 동시 요청에도 한도를 넘지 않게 한다. service role 전용
create or replace function public.consume_premium_quota(p_uid uuid, p_feature text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_limit integer;
  v_used integer;
  v_allowed boolean;
begin
  select daily into v_limit from public.premium_quota_setting where feature = p_feature;
  if not found then
    raise exception 'premium_quota_setting 행(feature=%)이 없습니다', p_feature;
  end if;

  insert into public.premium_usage (uid, day, feature)
  values (p_uid, v_day, p_feature)
  on conflict (uid, day, feature) do nothing;

  select pu.used
    into v_used
  from public.premium_usage pu
  where pu.uid = p_uid
    and pu.day = v_day
    and pu.feature = p_feature
  for update;

  v_allowed := v_used < v_limit;

  if v_allowed then
    update public.premium_usage
      set used = used + 1
    where uid = p_uid
      and day = v_day
      and feature = p_feature;
    v_used := v_used + 1;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', greatest(v_limit - v_used, 0),
    'limit', v_limit
  );
end;
$$;

revoke all on function public.consume_premium_quota(uuid, text) from public, anon, authenticated;

-- 실패 시 오늘 차감을 되돌린다 (0 미만 금지). service role 전용
create or replace function public.release_premium_quota(p_uid uuid, p_feature text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.premium_usage
    set used = greatest(used - 1, 0)
  where uid = p_uid
    and feature = p_feature
    and day = (now() at time zone 'Asia/Seoul')::date;
$$;

revoke all on function public.release_premium_quota(uuid, text) from public, anon, authenticated;

-- 로그인한 본인 기준 오늘 기능 사용량 조회 (행을 만들지 않는다)
create or replace function public.get_premium_quota(p_feature text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_limit integer;
  v_used integer := 0;
begin
  select daily into v_limit from public.premium_quota_setting where feature = p_feature;
  if not found then
    raise exception 'premium_quota_setting 행(feature=%)이 없습니다', p_feature;
  end if;

  select pu.used
    into v_used
  from public.premium_usage pu
  where pu.uid = v_uid
    and pu.day = v_day
    and pu.feature = p_feature;

  if not found then
    v_used := 0;
  end if;

  return jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0)
  );
end;
$$;

revoke all on function public.get_premium_quota(text) from public, anon, authenticated;
grant execute on function public.get_premium_quota(text) to authenticated;

-- 편의점 판정 기록 (edge function이 service role로 기록)
create table public.food_check (
  id bigserial primary key,
  uid uuid not null references public.user (id) on delete cascade,
  input_type text not null check (input_type in ('front', 'label', 'text')),
  input_text text,
  image_path text,
  thumb_path text,
  product_name text,
  score integer check (score between 1 and 10),
  verdict text check (verdict in ('ok', 'avoid')),
  basis text check (basis in ('estimate', 'label')),
  reasons text[],
  alternatives text[],
  week integer,
  created_at timestamptz not null default now()
);

create index food_check_uid_created_at_idx on public.food_check (uid, created_at desc);

alter table public.premium_quota_setting enable row level security;
alter table public.premium_usage enable row level security;
alter table public.food_check enable row level security;

create policy "구독 기능 한도 설정은 누구나 조회"
  on public.premium_quota_setting for select
  to anon, authenticated
  using (true);

-- premium_usage: RLS 켜고 정책 없음 (service role과 security definer 함수만 접근)

create policy "편의점 판정 기록은 본인만 조회"
  on public.food_check for select
  to authenticated
  using (uid = auth.uid());

-- food_check insert/update/delete 정책 없음 (edge function이 service role로 기록)

-- 판정 이미지 저장소 (private). 경로: {uid}/{id}.jpg, {uid}/{id}_thumb.jpg. 업로드는 service role
insert into storage.buckets (id, name, public)
values ('food-check', 'food-check', false)
on conflict (id) do nothing;

create policy "편의점 판정 이미지는 본인 폴더만 조회"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'food-check'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
