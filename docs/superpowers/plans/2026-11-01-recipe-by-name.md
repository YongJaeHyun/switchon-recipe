# 먹고 싶은 음식으로 레시피 만들기 — 구현 계획

스펙: `docs/superpowers/specs/2026-11-01-recipe-by-name-design.md`

## 구조 결정
- **새 엣지 함수 `create-recipe-by-name`** (기존 `create-recipe-by-gemini`는 동작 그대로). 레시피 생성·이미지·저장 본체는
  `_shared/createRecipe.ts`에서 `generateAndSaveRecipe()`로 꺼내 두 함수가 같이 쓴다 (기존 insert 값은 바뀌지 않음).
- 흐름(handler.ts, Vitest): 인증 → 입력 정리(따옴표·줄바꿈·제어문자 제거, 1~30자) → 패스 확인(`has_premium_access_for`)
  → 패스가 없으면 무료 체험 차감(평생 2번, 다 썼으면 402) → 이름 확인 하루 10번 카운터(`consume_premium_quota('recipe_name_check')`,
  넘으면 429 `NAME_CHECK_LIMIT`) → 레시피 하루 한도(`consume_recipe_quota`, 넘으면 429 `QUOTA_EXCEEDED`)
  → Gemini flash-lite 이름 판정(ok/adapt/reject) → reject면 체험·하루 한도 되돌리고 200 `rejected`
  (확인 카운터는 남김 = 거절 수) / ok·adapt면 확인 카운터 되돌리고 생성 → 실패 시 체험 되돌림, 하루 한도는 패스 사용자만 되돌림.
- 주차는 서버가 `user.start_date`로 계산 (food-check와 같은 `programWeekOf`). 레시피 주차 = min(주차,3), 규칙 주차 = min(주차,4).
- adapt 안내는 새 열 `recipe.adapt_note`(text, null)에 저장, 레시피 상세에 카드로 표시.

## 작업
1. **마이그레이션** `20261101020000_recipe_by_name.sql`: `user_trial.recipe_by_name_used`, `consume_recipe_by_name_trial(uuid,int)`,
   `release_recipe_by_name_trial(uuid)`(service role 전용), `premium_quota_setting('recipe_name_check', 10)`,
   `recipe.adapt_note` + `recipe_with_is_saved`·`search_recipes`·`search_saved_recipes`에 열 추가. 테스트: 글자 단위 확인.
2. **이름 판정 순수 로직** `_shared/recipeNameCheck.ts`: `sanitizeDishName`, `buildNameCheckPrompt`, `parseNameCheckResponse`,
   `buildRecipeByNameCommand`, `RECIPE_BY_NAME_TRIAL_LIMIT=2`, `recipeByNameTrialRemaining`. 요청 함수는
   `create-recipe-by-name/nameCheck.ts` `requestNameCheck(prompt, key, fetchFn)`. TDD.
3. **핸들러** `create-recipe-by-name/handler.ts` `handleRecipeByName(req, deps)`. TDD (모든 차감·되돌림 경로).
4. **연결** `create-recipe-by-name/index.ts` + `deno.json` + `config.toml`; `createRecipe.ts` 리팩터; wiring 테스트에 새 호출부 추가.
5. **get-pass-status** `recipeByNameTrialRemaining` 추가 (select `*`로 열이 없어도 실패 안 함).
6. **앱 순수 로직**: `utils/passTrial.ts`(공통 진입 상태) → `foodCheckEntryState` 위임, `utils/recipeByName.ts`
   (`recipeByNameEntryState`, `sanitizeDishNameInput`, `interpretRecipeByNameResponse`). TDD.
7. **앱 API·훅**: `api/RecipeByNameAPI.ts`, `hooks/useRecipeByName.ts` (useQuotaGate 재사용, 성공 시 상세로).
8. **UI** (frontend-design): `components/recipeByName/RecipeByNameSheet.tsx`, 레시피 탭 넓은 카드(RecipeToolCards 맨 위),
   탐색 결과 없음 버튼(CreateRecipeSuggestion 위), 레시피 상세 adapt 카드, 패스 기능 목록에 한 줄.
9. **검증**: tsc, vitest 전체, eslint·prettier(바뀐 파일), deno check(새/바뀐 함수).

## 유료 테스트
`tests/integrations/recipeNameCheck.integration.test.ts` — `RUN_PAID_TESTS=1`일 때만 실제 flash-lite 호출.
