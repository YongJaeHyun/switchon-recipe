-- 재료 요청 자동 추가: 재료/재료 요청 테이블, RLS, 이미지 버킷

create table public.ingredient_request (
  id bigint generated always as identity primary key,
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 10),
  normalized_name text generated always as (regexp_replace(btrim(name), '\s', '', 'g')) stored,
  status text not null default 'pending'
    check (status in ('pending', 'added', 'rejected', 'duplicate', 'failed')),
  result jsonb,
  created_at timestamptz not null default now()
);

create index ingredient_request_normalized_name_idx on public.ingredient_request (normalized_name);
create index ingredient_request_uid_created_at_idx on public.ingredient_request (uid, created_at);

create table public.ingredient (
  id bigint generated always as identity primary key,
  name text not null unique,
  sub_keywords text[] not null default '{}',
  week smallint not null check (week between 1 and 3),
  is_carbohydrate boolean not null default false,
  image_url text not null,
  image_source text not null check (image_source in ('seed', 'pixabay', 'generated', 'manual')),
  is_active boolean not null default true,
  source text not null check (source in ('seed', 'auto', 'manual')),
  sort_order integer not null,
  request_id bigint references public.ingredient_request (id) on delete set null,
  ai_reason text,
  created_at timestamptz not null default now()
);

-- 유저의 오늘(KST) 재료 요청 수
create or replace function public.ingredient_request_count_today(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ingredient_request
  where uid = p_uid
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

revoke all on function public.ingredient_request_count_today(uuid) from public;
grant execute on function public.ingredient_request_count_today(uuid) to authenticated;

alter table public.ingredient enable row level security;
alter table public.ingredient_request enable row level security;

create policy "활성 재료는 누구나 조회"
  on public.ingredient for select
  to anon, authenticated
  using (is_active);

create policy "본인 재료 요청 등록 (하루 5건)"
  on public.ingredient_request for insert
  to authenticated
  with check (
    uid = auth.uid()
    and status = 'pending'
    and public.ingredient_request_count_today(auth.uid()) < 5
  );

insert into storage.buckets (id, name, public)
values ('ingredient-images', 'ingredient-images', true)
on conflict (id) do nothing;
