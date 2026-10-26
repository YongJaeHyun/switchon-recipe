-- 맞춤 레시피 추천: 레시피 맛·종류·방식 태그 + 유저별 빼고 싶은 재료
-- 기존 레시피는 null (이후 백필)

alter table public.recipe
  add column spicy boolean,
  add column cuisine text check (cuisine in ('korean', 'western', 'chinese', 'japanese', 'other')),
  add column method text check (method in ('stir_fry', 'grill', 'soup', 'steam', 'salad', 'rice_bowl', 'other'));

create table public.user_recipe_preference (
  uid uuid primary key references public.user (id) on delete cascade,
  excluded_ingredients text[] not null default '{}'
    check (cardinality(excluded_ingredients) <= 30),
  updated_at timestamptz not null default now()
);

alter table public.user_recipe_preference enable row level security;

create policy "레시피 선호는 본인만 조회"
  on public.user_recipe_preference for select
  to authenticated
  using (uid = auth.uid());

create policy "레시피 선호는 본인만 추가"
  on public.user_recipe_preference for insert
  to authenticated
  with check (uid = auth.uid());

create policy "레시피 선호는 본인만 수정"
  on public.user_recipe_preference for update
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());
