-- 만든 사람에게만 의미 있는 안내("원래 음식에서 이렇게 바꿨어요", "치즈가 들어가 2주차 레시피로 저장했어요")를
-- 누구나 읽는 recipe 행에서 빼서, 본인만 읽는 recipe_note로 옮긴다 (운영자 2026-11-03).
-- 앱이 읽는 뷰·RPC는 adapt_note 열 이름을 그대로 두고 "보는 사람 본인의 안내"만 채운다 (옛 앱 그대로 동작).
-- recipe.adapt_note 열은 옛 함수 호환을 위해 남기되 비운다 (새 함수는 recipe_note에만 쓴다).

create table if not exists public.recipe_note (
  recipe_id bigint primary key references public.recipe(id) on delete cascade,
  uid uuid not null,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_note enable row level security;

drop policy if exists "본인 레시피 안내만 읽기" on public.recipe_note;
create policy "본인 레시피 안내만 읽기"
  on public.recipe_note for select
  to authenticated
  using (uid = auth.uid());

-- 이미 저장된 안내 옮기기 (다시 실행해도 안전)
insert into public.recipe_note (recipe_id, uid, note)
select id, uid, adapt_note from public.recipe
where adapt_note is not null and uid is not null
on conflict (recipe_id) do nothing;

update public.recipe set adapt_note = null where adapt_note is not null;

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
    n.note AS adapt_note
   FROM recipe r
     LEFT JOIN ( SELECT saved_recipe.recipe_id,
            count(*) AS total_count
           FROM saved_recipe
          WHERE saved_recipe.uid <> auth.uid()
          GROUP BY saved_recipe.recipe_id) all_saved ON r.id = all_saved.recipe_id
     LEFT JOIN saved_recipe usr ON r.id = usr.recipe_id AND usr.uid = auth.uid()
     LEFT JOIN recipe_note n ON n.recipe_id = r.id AND n.uid = auth.uid();

-- 반환 표는 그대로라 create or replace (권한 유지). 본문은 운영 DB 정의 그대로에서 안내 열과 조인만 바꿨다
CREATE OR REPLACE FUNCTION public.search_recipes(week_input integer DEFAULT NULL::integer, filter_type text DEFAULT '전체'::text, sort_type text DEFAULT '최신순'::text, keyword_input text DEFAULT NULL::text)
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
    n.note AS adapt_note
FROM filtered_recipes r
LEFT JOIN total_saved ts ON r.id = ts.recipe_id
LEFT JOIN recipe_note n ON n.recipe_id = r.id AND n.uid = auth.uid()
LEFT JOIN user_saved us ON r.id = us.recipe_id
ORDER BY
    CASE WHEN sort_type = '저장 많은 순' THEN COALESCE(ts.saved_count, 0) END DESC,
    CASE WHEN sort_type = '최신순' THEN r.created_at END DESC,
    CASE WHEN sort_type = '조리시간 빠른 순' THEN r.cooking_time END ASC,
    r.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_saved_recipes(week_input integer DEFAULT NULL::integer, filter_type text DEFAULT '전체'::text, sort_type text DEFAULT '최신순'::text)
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
    n.note AS adapt_note
FROM filtered_recipes r
LEFT JOIN total_saved ts ON r.id = ts.recipe_id
LEFT JOIN recipe_note n ON n.recipe_id = r.id AND n.uid = auth.uid()
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
