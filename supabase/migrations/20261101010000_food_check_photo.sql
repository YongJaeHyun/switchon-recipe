-- 음식 판정: 사진 한 장으로 받는다 (앱이 'photo'를 보냄, 옛 빌드의 'front'·'label'도 계속 저장)
-- 그리고 모델이 고른 음식 종류(포장 상품/조리된 음식)를 남긴다.
--
-- input_type 검사는 20261021000000_premium_food_check.sql의 컬럼 인라인 check라서
-- Postgres 자동 이름 food_check_input_type_check를 쓴다. 이름이 다르면 조용히 넘어가지 않도록
-- if exists를 붙이지 않는다.
alter table public.food_check drop constraint food_check_input_type_check;
alter table public.food_check
  add constraint food_check_input_type_check
  check (input_type in ('photo', 'front', 'label', 'text'));

-- 옛 기록과 모델이 고르지 못한 경우는 null
alter table public.food_check
  add column food_kind text check (food_kind in ('packaged', 'dish'));
