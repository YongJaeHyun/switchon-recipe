-- 체중 목표 (기록 탭 "목표까지" 카드, 그래프 목표 점선). 목표 체중·골격근량 목표·체지방량 목표(kg)와
-- 달성한 목표 기록. 폰을 바꿔도 남도록 user_setting에 둔다.
--
-- 범위는 입력 칸 규칙과 같다: 체중은 weight_log.weight_kg(20.0~300.0), 인바디는
-- 20261030020000_weight_body_comp.sql(골격근량 5.0~100.0, 체지방량 1.0~200.0).
-- weight_goal_history: 달성한 목표 [{ goal_kg, reached_on: 'YYYY-MM-DD', reached_kg }] (앱이 달성을 본 때 추가).
-- 새 목표의 진행률은 직전 달성 지점부터 세고, 그래프에 닿은 날 표시를 붙이며, 축하를 한 번만 하는 데 쓴다.
--
-- 구버전 앱 호환: 새 열만 추가하고 모두 null 허용/기본값이 있어, 구버전의 select * · upsert(보낸 열만 바꿈)에
-- 영향이 없다. 권한: user_setting RLS(본인 행만)는 행 단위라 새 열에도 그대로 적용된다.

alter table public.user_setting
  add column if not exists weight_goal_kg numeric(4, 1) null
    constraint user_setting_weight_goal_kg_range check (weight_goal_kg between 20.0 and 300.0),
  add column if not exists muscle_goal_kg numeric(4, 1) null
    constraint user_setting_muscle_goal_kg_range check (muscle_goal_kg between 5.0 and 100.0),
  add column if not exists fat_goal_kg numeric(4, 1) null
    constraint user_setting_fat_goal_kg_range check (fat_goal_kg between 1.0 and 200.0),
  add column if not exists weight_goal_history jsonb not null default '[]'::jsonb
    constraint user_setting_weight_goal_history_array check (jsonb_typeof(weight_goal_history) = 'array');

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
