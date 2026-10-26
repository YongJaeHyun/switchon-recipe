-- 레시피 검색용 재료 태그: 재료 문구("현미밥 (지은 밥)", "다진 마늘")에서 뽑은 등록 재료(ingredient.name) 이름 목록.
-- 화면에 보이는 recipe.ingredients 문구는 그대로 두고, 재료 태그 검색(ingredient_tags @> / && 배열)에만 쓴다.
-- 새 레시피는 create-recipe-by-gemini가 저장할 때 채우고, 기존 레시피와 등록 재료가 바뀐 뒤는 refresh-ingredient-tags 함수가 채운다 (20261026010000).
--
-- 권한: recipe는 테이블 단위 grant(anon·authenticated select)와 "Enable read access for all users"(select using true)
-- 정책이라 새 열도 다른 열처럼 누구나 읽을 수 있다. update 정책이 없어 클라이언트는 이 열을 고칠 수 없고
-- service role(엣지 함수)만 쓴다. 그래서 정책은 바꾸지 않는다.

alter table public.recipe
  add column if not exists ingredient_tags text[] not null default '{}';

create index if not exists recipe_ingredient_tags_idx
  on public.recipe using gin (ingredient_tags);
