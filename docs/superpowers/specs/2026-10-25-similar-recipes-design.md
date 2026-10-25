# 레시피 상세의 비슷한 레시피

## 무엇을

레시피 상세 화면(`app/recipeDetail.tsx`) 아래쪽, 조리순서 다음에 "비슷한 레시피" 섹션을 둔다.
비슷한 레시피 최대 6개를 가로 목록으로 보여 준다. 카드는 홈의 가로 목록(최근 만든·저장한 레시피)에서 쓰는
`components/recipes/RecipeCard.tsx`를 그대로 쓴다. 카드를 누르면 그 레시피 상세가 새 화면으로 쌓이고
(`push`), 뒤로 가기로 원래 상세에 돌아온다.

## 왜

상세 화면을 다 본 뒤 다음 레시피로 이어 갈 길이 없다. 탐색 탭으로 돌아가 다시 고르지 않고도 비슷한 재료·
요리 방식의 레시피를 바로 볼 수 있게 한다.

## 무료

패스 확인을 하지 않는다. 로그인(유저 JWT)만 필요하다 (주차 계산에 uid가 필요).

## 서버: `similar-recipes` 엣지 함수

- 구조는 `recommend-recipes`와 같다: `handler.ts`(deps 주입, Vitest), `index.ts`(Supabase 연결).
- 요청 `{ recipeId: number }` (양의 정수가 아니면 400). 레시피가 없으면 404. 로그인 정보가 없으면 401.
- 응답 `{ recipes: [...] }`, 각 행은 `recipe_with_is_saved` 모양 (`is_saved`, `saved_at`,
  `saved_count`=다른 유저 저장 수. 카드는 `saved_count + 내 저장 여부`로 표시).

### 후보 범위

맞춤 추천과 같다: 이미지가 있고 `week <= min(유저 프로그램 주차, 4)`. 1주차 유저는 1주차 레시피만 본다.
기준 레시피 자신과, 이름(소문자·공백 제거)이 기준 레시피와 같은 레시피는 뺀다.

후보는 점수에 필요한 열만(`id, recipe_name, ingredients, cuisine, method, spicy`) 전부 읽는다
(추천도 공개 범위 전체를 읽는다. 2026-10-25 기준 이미지 있는 레시피 607개, 1주차 454개).
조리 순서·영양 정보 등 카드 열은 상위 6개만 따로 읽는다.

### 점수 (`_shared/similarRecipes.ts`, 순수 함수)

- 재료: 등록 재료 정규화(`ingredientNormalize.ts`)로 맞춘 이름 집합의 Jaccard × 10
- 같은 종류(cuisine) +2, 같은 방식(method) +1, 같은 맵기(spicy) +0.5 (태그는 둘 다 값이 있을 때만)
- 공유 재료가 하나도 없으면 종류와 방식이 모두 같을 때만 남긴다
- 정렬: 점수 내림차순 → 저장 수(전체) 내림차순 → id 내림차순, 상위 6개
- 저장 수는 6번째 점수 이상인 후보(동점 포함)만 조회한다

## 앱

- `api/SimilarRecipesAPI.ts` + `hooks/useSimilarRecipes(recipeId)` (React Query, 레시피마다 캐시,
  staleTime 10분, `failFastWhenOffline`). 응답의 저장 여부는 `recipeStore.isSavedMap`에 합친다.
- 불러오는 중엔 카드 자리 스켈레톤 3개, 실패하거나 결과가 비면 섹션을 숨긴다 (토스트 없음).
