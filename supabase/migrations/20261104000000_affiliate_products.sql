-- 재료 제휴 링크 (쿠팡 파트너스) 1차: 시작 전 준비 체크리스트의 [사러 가기]
-- affiliate_product: 운영자가 대시보드/SQL로 넣는다 (앱 쓰기 정책 없음). 앱은 active인 것만 읽는다.
--   slot: 'shake'(프로틴 쉐이크 준비하기) / 'groceries'(저탄수식 재료 장보기). 한 slot에 하나라도 있어야 칩이 보인다.
--   앱은 slot마다 sort → id 순서로 최대 4개, https 링크만 보여준다.
-- affiliate_click: [쿠팡에서 보기]를 누른 기록 (앱은 넣기만, 읽기 정책 없음).
-- 새 테이블만 추가 (옛 앱 영향 없음).

create table if not exists public.affiliate_product (
  id bigint generated always as identity primary key,
  slot text not null check (slot in ('shake', 'groceries')),
  name text not null,
  description text,
  url text not null check (url ~ '^https://'),
  image_url text,
  sort smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists affiliate_product_slot_idx on public.affiliate_product (slot, sort);

alter table public.affiliate_product enable row level security;

drop policy if exists "affiliate_product select active" on public.affiliate_product;
create policy "affiliate_product select active" on public.affiliate_product
  for select to authenticated
  using (active);

create table if not exists public.affiliate_click (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  uid uuid default auth.uid(),
  product_id bigint references public.affiliate_product (id) on delete set null,
  slot text
);

create index if not exists affiliate_click_product_idx on public.affiliate_click (product_id, created_at desc);

alter table public.affiliate_click enable row level security;

drop policy if exists "affiliate_click insert own" on public.affiliate_click;
create policy "affiliate_click insert own" on public.affiliate_click
  for insert to authenticated
  with check (uid = auth.uid());

-- 운영자용 예시 (SQL Editor에서). 링크는 쿠팡 파트너스에서 만든 https 주소, sort 작은 것이 위:
-- insert into public.affiliate_product (slot, name, description, url, image_url, sort) values ('shake', '○○ 단백질 쉐이크', '1회 당류 2g', 'https://link.coupang.com/a/xxxx', 'https://image.coupang.com/xxxx.jpg', 0);
-- insert into public.affiliate_product (slot, name, description, url, image_url, sort) values ('groceries', '△△ 두부면', '저탄수식 면 대신', 'https://link.coupang.com/a/yyyy', null, 0);
-- 내리기: update public.affiliate_product set active = false where id = 1;
-- 누른 수: select product_id, count(*) from public.affiliate_click group by product_id;
