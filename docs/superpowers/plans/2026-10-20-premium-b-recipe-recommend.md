# 구독 전용 기능 B: 맞춤 레시피 추천 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 맛·종류·방식·조리 시간·끼니·꼭 넣을/빼고 싶은 재료를 고르면 기존 레시피에서 현재 주차에 맞는 3~5개를 추천하고, 없거나 마음에 안 들면 같은 조건으로 새로 만들게 한다.

**Architecture:** 레시피에 태그 컬럼(spicy·cuisine·method)을 추가하고 신규 생성 시 함께 만들며, 기존 레시피는 일회성 태깅 함수로 채운다. 끼니→저탄수/무탄수/쉐이크 규칙과 필터·정렬은 순수 모듈 `_shared/recommend.ts`에 두고, Edge Function `recommend-recipes`가 패스 확인 후 이를 적용한다. 앱은 `app/recommend.tsx` 화면을 추가하고 "새로 만들기"는 기존 레시피 생성 흐름(한도·모달 포함)을 재사용한다.

**Tech Stack:** Supabase Postgres + Edge Functions, Gemini `gemini-2.5-flash`(태깅), Expo / React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-premium-features-design.md` (§3 공통, §5 맞춤 레시피 추천)

**Depends on:** Plan A Task 4의 `components/home/PremiumFeatureCards.tsx` (홈 진입 카드 추가 지점).

## Global Constraints
- Plan A의 Global Constraints 전체 (서버 판단, RLS, service role 클라이언트, 순수 모듈, 커밋 꼬리말, 배포 승인).
- 기존 레시피 추천은 하루 한도 없음. "새로 만들기"는 기존 `create-recipe-by-gemini` 하루 레시피 한도 포함(한도 초과 시 기존 `QuotaExceededModal`).
- 조건을 넘기는 레시피 생성은 패스 여부와 상관없이 허용 (추천 "화면"만 패스 전용).
- 추천 대상 범위 = 탐색 탭이 보여주는 범위(`search_recipes` RPC와 같은 공개 기준). 빌더가 `search_recipes` 정의를 읽고 같은 조건을 쓴다.
- 현재 주차보다 늦은 주차 레시피 제외, 빼고 싶은 재료 포함 레시피 제외, 꼭 넣을 재료가 있으면 모두 포함한 것만.
- 끼니 규칙은 앱 `const/baseTodos.ts`의 `BASE_TODOS`와 `useTodos`의 단계 계산(`week===1 ? (day<=3 ? 1 : 2) : week+1`, 5주차+는 단계 5 규칙 사용)을 따른다.
- 쉐이크 끼니 선택지는 비활성 + "이 끼니는 프로틴쉐이크예요". 모든 끼니가 쉐이크인 단계(1주차 1~3일)는 입구에 "2주차부터 쓸 수 있어요".
- 결과 3~5개, 같은 조건 재조회 시 다른 조합(서버에서 섞기).

## Review Focus
1. **조건을 많이 걸어 결과 0개**: 바로 [이 조건으로 새로 만들기]를 크게 → Task 3 테스트(0개 응답 형식), Task 4 화면.
2. **태그 없는 레시피(태깅 전/실패)**: 맛·종류·방식 조건이 "상관없음"이 아니면 제외, 모두 상관없음이면 포함 → Task 2 테스트.
3. **빼고 싶은 재료가 재료명 일부로만 일치**("닭" vs "닭가슴살"): 재료명 정규화 후 정확 일치 + 등록 재료의 `sub_keywords` 매칭 → Task 2 테스트.
4. **주차 경계**: 2주차 유저에게 3주차 레시피가 나오지 않음 → Task 2 테스트.
5. **새로 만들기 중 한도 초과**: 기존 모달이 뜨고 화면 상태 유지 → Task 4 (useQuotaGate 재사용).

---

### Task 1: 레시피 태그 컬럼 + 생성 시 태그 + 빼고 싶은 재료 저장

**Files:**
- Create: `supabase/migrations/20261021010000_recipe_tags.sql`
- Modify: `supabase/functions/_shared/createRecipe.ts` (응답 스키마·프롬프트·insert에 태그), `types/database.types.ts`(수동으로 생성 형식 맞춤)
- Create: `supabase/functions/_shared/recipeTags.ts` (순수) + `supabase/functions/tests/recommend/recipeTags.test.ts`

**Interfaces (Produces):**
- `recipe`에 `spicy boolean null`, `cuisine text null check in ('korean','western','chinese','japanese','other')`, `method text null check in ('stir_fry','grill','soup','steam','salad','rice_bowl','other')` 추가. 기존 행은 null.
- 테이블 `user_recipe_preference(uid uuid pk fk cascade, excluded_ingredients text[] not null default '{}', updated_at)`, RLS 본인 select/insert/update.
- `recipeTags.ts`:
  ```ts
  export type Cuisine = 'korean'|'western'|'chinese'|'japanese'|'other';
  export type Method = 'stir_fry'|'grill'|'soup'|'steam'|'salad'|'rice_bowl'|'other';
  export interface RecipeTags { spicy: boolean; cuisine: Cuisine; method: Method }
  export function parseRecipeTags(raw: unknown): RecipeTags | null; // 값 목록 밖이면 null
  export const RECIPE_TAG_SCHEMA_PROMPT: string; // 생성·태깅 프롬프트에 붙일 설명
  ```
- `createRecipe.ts`: Gemini 응답 스키마에 `spicy`, `cuisine`, `method` 추가, `parseRecipeTags`로 검증해 insert(검증 실패 시 null로 저장, 생성은 성공).

- [ ] **Step 1: 실패 테스트**: 정상 태그, 목록 밖 cuisine → null, spicy 문자열 "true" → null
- [ ] **Step 2~4:** 구현 → PASS, `deno check`(create-recipe-by-gemini, -test)
- [ ] **Step 5: Commit** `🗃️ 레시피 맛·종류·방식 태그 추가`

### Task 2: 추천 순수 로직 `_shared/recommend.ts`

**Files:**
- Create: `supabase/functions/_shared/recommend.ts`
- Test: `supabase/functions/tests/recommend/recommend.test.ts`, `const/baseTodos.mealRule.test.ts`(앱 BASE_TODOS와 규칙 일치 확인)

**Interfaces (Produces):**
```ts
export type Meal = 'breakfast'|'lunch'|'dinner';
export type MealKind = 'shake'|'low'|'zero';
export function stepOf(week: number, day: number): number;          // useTodos와 동일, 5주차+ → 5
export function mealKind(step: number, meal: Meal): MealKind;         // BASE_TODOS 아침/점심/저녁 항목 기준
export interface RecommendConditions {
  spicy?: boolean | null; cuisine?: Cuisine | null; method?: Method | null;
  maxMinutes?: 15 | 30 | null; meal?: Meal | null;
  mustInclude?: string[]; exclude?: string[];
}
export interface RecipeRow { id: number; week: number; is_zero_carb: boolean; cooking_time: number; ingredients: {name:string}[]; spicy: boolean|null; cuisine: string|null; method: string|null }
export function filterRecipes(rows: RecipeRow[], c: RecommendConditions, ctx: { week: number; day: number }, normalize: (name: string) => string): RecipeRow[];
export function pickRecommendations<T>(rows: T[], count: number, random: () => number): T[]; // 3~5개, 중복 없이 섞기
```
- `filterRecipes` 규칙: `row.week <= min(week,4)`; meal이 있으면 `mealKind`가 low→`!is_zero_carb`... 단, 무탄수 레시피는 저탄수 끼니에도 허용(더 엄격하므로), zero 끼니는 `is_zero_carb`만; shake 끼니면 빈 배열; 태그 조건이 지정됐는데 태그가 null이면 제외; maxMinutes 이하; exclude에 걸리는 재료가 하나라도 있으면 제외; mustInclude는 모두 포함.
- 정규화 함수는 호출부가 주입 (서버는 재료명 정규화 + sub_keywords 맵 사용).

- [ ] **Step 1: 실패 테스트**
  - `stepOf(1,2)=1`, `stepOf(1,4)=2`, `stepOf(2,1)=3`, `stepOf(4,7)=5`, `stepOf(7,1)=5`
  - `mealKind(1,'lunch')='shake'`, `mealKind(3,'dinner')='shake'`, `mealKind(4,'dinner')='zero'`, `mealKind(5,'dinner')='low'`
  - 앱 테스트: 단계 1~5 × 끼니에 대해 `mealKind` 결과가 `BASE_TODOS[step]`의 해당 끼니 문구('쉐이크'/'저탄수식'/'무탄수식')와 일치
  - 2주차 유저에게 week 3 레시피 제외; 저녁 zero면 저탄수 레시피 제외, 점심 low면 무탄수 레시피 포함
  - cuisine 지정 + 태그 null 레시피 제외 / 조건 전부 null이면 포함
  - exclude ['닭가슴살'] + 재료 '닭 가슴살' (정규화 후 일치) 제외; mustInclude 두 개 중 하나만 있으면 제외
  - `pickRecommendations` 고정 random으로 결정적, 개수 상한, 중복 없음
- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** `✨ 맞춤 레시피 추천 필터·끼니 규칙 로직 추가`

### Task 3: Edge Function `recommend-recipes` + 기존 레시피 태깅 함수

**Files:**
- Create: `supabase/functions/recommend-recipes/{index.ts,handler.ts,deno.json}`, `supabase/functions/tag-recipes/{index.ts,deno.json}`
- Modify: `supabase/config.toml`(recommend-recipes verify_jwt=true; tag-recipes verify_jwt=false + service role 헤더 확인), deploy 스크립트
- Test: `supabase/functions/tests/recommend/handler.test.ts`

**Interfaces:**
- Consumes: Task 1·2, `assertPremium`, `_shared/serviceRole.ts`(service role 요청 확인; 기존 함수 참고).
- Produces: `POST /functions/v1/recommend-recipes` body `RecommendConditions` → 200 `{ recipes: RecipeWithIsSavedDB[] (최대 5), totalMatches: number }`, 402, 400(값 목록 밖). 0개면 `{ recipes: [], totalMatches: 0 }`.
  - 후보 조회는 `search_recipes`와 같은 공개 범위에서 `week <= min(week,4)`로 좁혀 가져온 뒤 `filterRecipes` → `pickRecommendations(…, 5, Math.random)`. 응답 레시피는 앱 `RecipeCard`가 쓰는 형식(`recipe_with_is_saved` 행 모양, `is_saved` 포함).
  - 유저의 `user_recipe_preference.excluded_ingredients`는 요청의 exclude와 합친다.
- `tag-recipes`: service role만. `spicy is null`인 레시피를 50개씩 Gemini로 태깅(`RECIPE_TAG_SCHEMA_PROMPT`, 레시피명+재료+조리단계 요약 입력), `parseRecipeTags` 통과한 것만 update. 응답 `{ tagged, failed, remaining }`. 여러 번 호출해 끝까지 진행(멱등).

- [ ] **Step 1: 실패 테스트** (`handleRecommend(req, deps)` 가짜 deps): 402; 잘못된 cuisine 400; 저장된 exclude와 요청 exclude 합쳐 필터에 전달; 0개 응답 형식; 5개 초과 후보 → 5개
- [ ] **Step 2~4:** FAIL → 구현 → PASS, `deno check` 두 함수
- [ ] **Step 5: Commit** `✨ 맞춤 레시피 추천 함수와 기존 레시피 태깅 함수 추가`

### Task 4: 앱 — 추천 화면

**Files:**
- Create: `app/recommend.tsx`, `api/RecommendAPI.ts`, `hooks/useRecommend.ts`, `utils/recommendForm.ts` (+ `utils/recommendForm.test.ts`)
- Modify: `components/home/PremiumFeatureCards.tsx`(카드 추가), `app/(tabs)/home/recipeCreation/{low,zero}.tsx` 또는 공용 생성 유틸 — 조건을 레시피 생성 명령문에 넣는 함수 재사용, `const/queryKey.ts`

**Interfaces:**
- Consumes: Task 3 응답, `useQuotaGate`(새로 만들기 한도·광고 모달), 기존 `createRecipe`, 기존 `RecipeCard`(탐색·홈에서 쓰는 카드), `CustomSelect`/칩 컴포넌트, 재료 선택(`useIngredients`)
- Produces: `utils/recommendForm.ts`
  ```ts
  export function availableMeals(week: number, day: number): { meal: Meal; enabled: boolean; reason?: '이 끼니는 프로틴쉐이크예요' }[];
  export function isRecommendLocked(week: number, day: number): boolean; // 모든 끼니 쉐이크 → true ("2주차부터 쓸 수 있어요")
  export function buildRecipeCommand(c: RecommendConditions, ctx: {week:number; day:number}): { command: string; isZeroCarb: boolean };
  ```
  `buildRecipeCommand`는 기존 low/zero 화면의 명령문 형식(영어 지시문 + 카테고리·방식 줄)을 따르고 맛·시간·꼭 넣을/뺄 재료 줄을 추가. 끼니가 zero면 isZeroCarb=true.
- 화면: 조건 칩(맛·종류·방식·시간·끼니) + 재료 고르기(꼭 넣을 최대 2개, 빼고 싶은 여러 개·[저장]) → [추천 받기] → 카드 3~5개 + [다른 추천 보기] + [이 조건으로 새로 만들기]. 0개면 새로 만들기 버튼만 크게.
- 새로 만들기: `useQuotaGate`와 기존 로딩 오버레이 흐름을 그대로 사용 (한도 초과 모달·광고·남은 개수 표시 포함).
- 쿼리 파라미터 `meal`(`breakfast|lunch|dinner`)이 있으면 끼니 조건을 미리 채운다 (Plan C 주간 리포트의 [추천 보기] 버튼이 사용).

- [ ] **Step 1: 실패 테스트**: `availableMeals(1,2)` 모두 비활성; `availableMeals(2,1)` 점심만 활성; `isRecommendLocked(1,3)=true`, `(1,4)=false`; `buildRecipeCommand({spicy:true, maxMinutes:15, meal:'dinner'}, {week:3,day:1})` → isZeroCarb true, 명령문에 'spicy'·'15 minutes' 포함
- [ ] **Step 2~4:** FAIL → 구현(화면 포함) → PASS, tsc·eslint
- [ ] **Step 5: Commit** `✨ 맞춤 레시피 추천 화면 추가`

### Task 5: 배포·태깅·E2E (운영자 승인 후)

- [ ] **Step 1 (승인)**: dry-run 확인 → `db push`; `create-recipe-by-gemini`, `-test`, `recommend-recipes`, `tag-recipes` 배포.
- [ ] **Step 2: 기존 레시피 태깅**: `tag-recipes`를 remaining 0까지 반복 호출. 무작위 20개 표본을 운영자 계정으로 보고 맛·종류 태그가 그럴듯한지 확인(틀린 비율 기록).
- [ ] **Step 3: 서버 E2E**: 패스 없음 402; 2주차 가정 점심+한식 → 결과 week≤2·저탄수만; 빼고 싶은 재료 적용; 조건 과다 → 0개.
- [ ] **Step 4: 앱 확인**: 1주차 잠금 문구, 결과 카드 → 레시피 상세, 새로 만들기(한도 표시·모달).
