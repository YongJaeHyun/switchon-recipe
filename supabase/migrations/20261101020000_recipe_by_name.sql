-- 먹고 싶은 음식으로 레시피 만들기 (패스 기능, 스펙 docs/superpowers/specs/2026-11-01-recipe-by-name-design.md)
-- - user_trial.recipe_by_name_used: 패스 없이 쓴 횟수 (사용자당 평생 2번). create-recipe-by-name이 아래 함수로 늘리고 되돌린다
-- - premium_quota_setting('recipe_name_check', 10): 이름 확인(Gemini 텍스트) 하루 10번. 확인이 통과하면 되돌리므로
--   남는 수 = 거절된 확인 수. 넘으면 Gemini를 부르지 않고 "오늘은 더 확인할 수 없어요"
-- - recipe.adapt_note: 원래는 피해야 하는 음식을 스위치온식으로 바꿔 만든 경우 "이렇게 바꿨어요" 안내 (한두 줄, 줄바꿈 구분)
-- 서버가 최종 판단한다 (앱 표시는 get-pass-status의 recipeByNameTrialRemaining을 참고만 한다).
--
-- 배포 순서: 이 마이그레이션 → create-recipe-by-name, get-pass-status 배포 → 앱(6.x).
-- 기존 create-recipe-by-gemini(5.x 포함)는 이 열을 쓰지 않으므로 순서와 관계없이 그대로 동작한다.

alter table public.user_trial
  add column if not exists recipe_by_name_used int not null default 0
    check (recipe_by_name_used >= 0);

-- 무료 1번을 원자적으로 쓴다. 쓴 뒤 남은 횟수, 이미 p_limit번을 다 썼거나 public.user 행이 없으면 -1.
-- consume_food_check_trial과 같은 방식 (행이 없으면 만든 뒤 조건부 update 한 번). service role 전용
create or replace function public.consume_recipe_by_name_trial(p_uid uuid, p_limit int)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  begin
    insert into public.user_trial (uid)
    values (p_uid)
    on conflict (uid) do nothing;
  exception when foreign_key_violation then
    return -1;
  end;

  update public.user_trial
    set recipe_by_name_used = recipe_by_name_used + 1,
        updated_at = now()
  where uid = p_uid
    and recipe_by_name_used < p_limit
  returning recipe_by_name_used into v_used;

  if not found then
    return -1;
  end if;

  return greatest(p_limit - v_used, 0);
end;
$$;

revoke all on function public.consume_recipe_by_name_trial(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_recipe_by_name_trial(uuid, int) to service_role;

-- 거절·생성 실패·한도 초과면 쓴 1번을 되돌린다 (0 미만 금지). service role 전용
create or replace function public.release_recipe_by_name_trial(p_uid uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.user_trial
    set recipe_by_name_used = greatest(recipe_by_name_used - 1, 0),
        updated_at = now()
  where uid = p_uid;
$$;

revoke all on function public.release_recipe_by_name_trial(uuid) from public, anon, authenticated;
grant execute on function public.release_recipe_by_name_trial(uuid) to service_role;

-- 이름 확인 하루 한도 (consume_premium_quota / release_premium_quota 재사용)
insert into public.premium_quota_setting (feature, daily)
values ('recipe_name_check', 10)
on conflict (feature) do nothing;

-- 바꿔 만든 안내. recipe의 다른 열처럼 누구나 읽고, 쓰기는 레시피를 저장하는 엣지 함수만 한다
-- (20261030000000_recipe_servings.sql과 같은 권한 구조라 정책은 바꾸지 않는다)
alter table public.recipe add column if not exists adapt_note text null;

-- 앱이 레시피를 읽는 뷰·RPC에 adapt_note를 맨 뒤 열로 더한다 (기존 열·순서는 그대로).
-- 본문은 20261030000000_recipe_servings.sql 정의 그대로이고 끝에 r.adapt_note만 더했다.
create or replace view public.recipe_with_is_saved
  with (security_invoker = on) as
 SELECT r.id,
    r.created_at,
    r.recipe_name,
    r.cooking_time,
    r.nutrition,
    r.ingredients,
    r.image_uri,
    r.uid,
    r.cooking_steps,
    r.week,
    r.is_zero_carb,
    usr.uid IS NOT NULL AS is_saved,
    usr.created_at AS saved_at,
    COALESCE(all_saved.total_count, 0::bigint) AS saved_count,
    r.servings,
    r.adapt_note
   FROM recipe r
     LEFT JOIN ( SELECT saved_recipe.recipe_id,
            count(*) AS total_count
           FROM saved_recipe
          WHERE saved_recipe.uid <> auth.uid()
          GROUP BY saved_recipe.recipe_id) all_saved ON r.id = all_saved.recipe_id
     LEFT JOIN saved_recipe usr ON r.id = usr.recipe_id AND usr.uid = auth.uid();

-- 반환 표가 바뀌므로 drop 후 다시 만들고 원래 권한을 다시 준다
drop function if exists public.search_recipes(integer, text, text, text);

create function public.search_recipes(week_input integer DEFAULT NULL::integer, filter_type text DEFAULT '전체'::text, sort_type text DEFAULT '최신순'::text, keyword_input text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, recipe_name text, ingredients text, nutrition text, image_uri text, week integer, cooking_steps text, cooking_time integer, is_zero_carb boolean, created_at timestamp with time zone, saved_count bigint, is_saved boolean, saved_at timestamp with time zone, servings smallint, adapt_note text)
 LANGUAGE sql
AS $function$
WITH
-- 1. 전체 저장 수 계산 (모든 유저 기준)
total_saved AS (
    SELECT
        recipe_id,
        COUNT(DISTINCT uid) AS saved_count
    FROM saved_recipe
    GROUP BY recipe_id
),

-- 2. 현재 유저가 저장한 레시피
user_saved AS (
    SELECT
        recipe_id,
        created_at
    FROM saved_recipe
    WHERE uid = auth.uid()
),

-- 3. 기본 recipe 필터 (week, 탄수화물, 검색어)
filtered_recipes AS (
    SELECT *
    FROM recipe
    WHERE (week_input IS NULL OR week = week_input)
      AND (
          filter_type = '전체'
          OR (filter_type = '무탄수' AND is_zero_carb = TRUE)
          OR (filter_type = '저탄수' AND is_zero_carb = FALSE)
      )
      AND (
          keyword_input IS NULL
          OR keyword_input = ''
          OR recipe_name ILIKE '%' || keyword_input || '%'
          OR ingredients ILIKE '%' || keyword_input || '%'
      )
)
-- 4. 최종 조인
SELECT
    r.id,
    r.recipe_name,
    r.ingredients,
    r.nutrition,
    r.image_uri,
    r.week,
    r.cooking_steps,
    r.cooking_time,
    r.is_zero_carb,
    r.created_at,
    COALESCE(ts.saved_count, 0) - CASE WHEN (us.recipe_id IS NOT NULL) THEN 1 ELSE 0 END AS saved_count,
    (us.recipe_id IS NOT NULL) AS is_saved,
    us.created_at AS saved_at,
    r.servings,
    r.adapt_note
FROM filtered_recipes r
LEFT JOIN total_saved ts ON r.id = ts.recipe_id
LEFT JOIN user_saved us ON r.id = us.recipe_id
ORDER BY
    CASE WHEN sort_type = '저장 많은 순' THEN COALESCE(ts.saved_count, 0) END DESC,
    CASE WHEN sort_type = '최신순' THEN r.created_at END DESC,
    CASE WHEN sort_type = '조리시간 빠른 순' THEN r.cooking_time END ASC,
    r.created_at DESC;
$function$;

grant execute on function public.search_recipes(integer, text, text, text)
  to public, anon, authenticated, service_role;

drop function if exists public.search_saved_recipes(integer, text, text);

create function public.search_saved_recipes(week_input integer DEFAULT NULL::integer, filter_type text DEFAULT '전체'::text, sort_type text DEFAULT '최신순'::text)
 RETURNS TABLE(id bigint, uid uuid, recipe_name text, ingredients text, nutrition text, image_uri text, week integer, cooking_steps text, cooking_time integer, is_zero_carb boolean, created_at timestamp with time zone, saved_count bigint, is_saved boolean, saved_at timestamp with time zone, servings smallint, adapt_note text)
 LANGUAGE sql
AS $function$
WITH
-- 1. 전체 저장 수 계산 (모든 유저 기준)
total_saved AS (
    SELECT
        recipe_id,
        COUNT(DISTINCT uid) AS saved_count
    FROM saved_recipe
    WHERE uid != auth.uid()
    GROUP BY recipe_id
),

-- 2. 현재 유저가 저장한 레시피
user_saved AS (
    SELECT
        recipe_id,
        created_at
    FROM saved_recipe
    WHERE uid = auth.uid()
),

-- 3. 기본 recipe 필터 (week, 탄수화물)
filtered_recipes AS (
    SELECT *
    FROM recipe
    WHERE (week_input IS NULL OR week = week_input)
      AND (
          filter_type = '전체'
          OR (filter_type = '무탄수' AND is_zero_carb = TRUE)
          OR (filter_type = '저탄수' AND is_zero_carb = FALSE)
      )
)
-- 4. 최종 조인 (is_saved인 레시피만)
SELECT
    r.id,
    auth.uid(),
    r.recipe_name,
    r.ingredients,
    r.nutrition,
    r.image_uri,
    r.week,
    r.cooking_steps,
    r.cooking_time,
    r.is_zero_carb,
    r.created_at,
    COALESCE(ts.saved_count, 0) AS saved_count,
    TRUE AS is_saved,
    us.created_at AS saved_at,
    r.servings,
    r.adapt_note
FROM filtered_recipes r
LEFT JOIN total_saved ts ON r.id = ts.recipe_id
INNER JOIN user_saved us ON r.id = us.recipe_id
ORDER BY
    CASE
        WHEN sort_type = '저장 많은 순' THEN COALESCE(ts.saved_count, 0)
        WHEN sort_type = '최신순' THEN EXTRACT(EPOCH FROM r.created_at)
    END DESC,
    CASE
        WHEN sort_type = '조리시간 빠른 순' THEN r.cooking_time
    END ASC,
    r.created_at DESC;
$function$;

grant execute on function public.search_saved_recipes(integer, text, text)
  to public, anon, authenticated, service_role;

-- PostgREST가 새 열·바뀐 반환 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
