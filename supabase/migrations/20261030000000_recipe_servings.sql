-- 레시피 기준 인분: 재료 양이 몇 인분 기준인지. 레시피 상세에서 1~N인분으로 재료 양을 바꿔 보여 줄 때 쓴다.
-- 새 레시피는 create-recipe-by-gemini가 AI가 정한 인분(1~8)을 저장하고, 기존 레시피는 estimate-recipe-servings
-- 함수가 AI로 추정해 채운다. 모르는 경우(백필 전, AI가 빠뜨림)는 null이고 앱은 인분 조절을 숨긴다.
--
-- 권한: recipe는 테이블 단위 grant(anon·authenticated select)와 "Enable read access for all users"(select using true)
-- 정책이라 새 열도 다른 열처럼 누구나 읽을 수 있다. update 정책이 없어 클라이언트는 이 열을 고칠 수 없고
-- service role(엣지 함수)만 쓴다. 그래서 정책은 바꾸지 않는다 (20261026000000_recipe_ingredient_tags.sql과 같음).

alter table public.recipe
  add column if not exists servings smallint null
    constraint recipe_servings_range check (servings between 1 and 10);

-- 앱이 레시피를 읽는 뷰·RPC에 servings를 맨 뒤 열로 더한다 (기존 열·순서는 그대로).

-- recipe_with_is_saved: 최근 만든·저장한 레시피 목록. create or replace view는 맨 뒤에 열을 더할 수 있고
-- 권한(grant)과 security_invoker 옵션은 그대로 유지된다 (옵션은 명시해 둔다).
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
    r.servings
   FROM recipe r
     LEFT JOIN ( SELECT saved_recipe.recipe_id,
            count(*) AS total_count
           FROM saved_recipe
          WHERE saved_recipe.uid <> auth.uid()
          GROUP BY saved_recipe.recipe_id) all_saved ON r.id = all_saved.recipe_id
     LEFT JOIN saved_recipe usr ON r.id = usr.recipe_id AND usr.uid = auth.uid();

-- search_recipes / search_saved_recipes: 반환 표(RETURNS TABLE)를 바꾸려면 create or replace로는 안 되어
-- drop 후 다시 만든다. 본문은 현재 원격 정의(pg_get_functiondef) 그대로이고 select 끝에 r.servings만 더했다.
-- drop하면 권한이 초기화되므로 원래 권한(PUBLIC·anon·authenticated·service_role execute)을 다시 준다.
drop function if exists public.search_recipes(integer, text, text, text);

create function public.search_recipes(week_input integer DEFAULT NULL::integer, filter_type text DEFAULT '전체'::text, sort_type text DEFAULT '최신순'::text, keyword_input text DEFAULT NULL::text)
 RETURNS TABLE(id bigint, recipe_name text, ingredients text, nutrition text, image_uri text, week integer, cooking_steps text, cooking_time integer, is_zero_carb boolean, created_at timestamp with time zone, saved_count bigint, is_saved boolean, saved_at timestamp with time zone, servings smallint)
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
    r.servings
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
 RETURNS TABLE(id bigint, uid uuid, recipe_name text, ingredients text, nutrition text, image_uri text, week integer, cooking_steps text, cooking_time integer, is_zero_carb boolean, created_at timestamp with time zone, saved_count bigint, is_saved boolean, saved_at timestamp with time zone, servings smallint)
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
-- ✅ 4. 최종 조인 (is_saved인 레시피만)
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
    r.servings
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

-- PostgREST가 바뀐 반환 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
