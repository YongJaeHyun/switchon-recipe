-- 스위치온 패스 결제: 무료 기간 설정, 패스 만료일, 구매 기록, 권한 함수

create table public.premium_setting (
  id smallint primary key default 1 check (id = 1),
  free_start date,
  free_end date,
  check ((free_start is null) = (free_end is null)),
  check (free_start is null or free_end >= free_start + 6)
);

insert into public.premium_setting (id, free_start, free_end)
values (1, null, null);

create table public.user_pass (
  uid uuid primary key references public.user (id) on delete cascade,
  pass_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.pass_purchase (
  id bigint generated always as identity primary key,
  uid uuid references public.user (id) on delete set null,
  product_id text not null,
  purchase_token text not null unique,
  order_id text,
  price_krw integer,
  purchased_at timestamptz not null,
  granted_from timestamptz,
  granted_until timestamptz,
  status text not null check (status in ('granted', 'voided', 'refunded_ineligible')),
  raw jsonb,
  created_at timestamptz not null default now()
);

create index pass_purchase_uid_purchased_at_idx on public.pass_purchase (uid, purchased_at);

-- 무료 기간이거나 패스 만료일이 남아있는지 판단 (서버 최종 판단용)
create or replace function public.has_premium_access_for(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.premium_setting
      where id = 1
        and free_start is not null
        and (now() at time zone 'Asia/Seoul')::date between free_start and free_end
    )
    or exists (
      select 1
      from public.user_pass
      where uid = p_uid
        and pass_expires_at > now()
    );
$$;

revoke all on function public.has_premium_access_for(uuid) from public, anon, authenticated;

-- 로그인한 본인 기준 프리미엄 접근 가능 여부
create or replace function public.has_premium_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_premium_access_for(auth.uid());
$$;

revoke all on function public.has_premium_access() from public, anon, authenticated;
grant execute on function public.has_premium_access() to authenticated;

alter table public.premium_setting enable row level security;
alter table public.user_pass enable row level security;
alter table public.pass_purchase enable row level security;

create policy "무료 기간 설정은 누구나 조회"
  on public.premium_setting for select
  to anon, authenticated
  using (true);

create policy "본인 패스 만료일만 조회"
  on public.user_pass for select
  to authenticated
  using (uid = auth.uid());

-- pass_purchase: RLS 켜고 정책 없음 (service role만 접근)
