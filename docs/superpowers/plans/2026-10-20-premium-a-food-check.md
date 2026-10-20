# 구독 전용 기능 A: 편의점 판정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진(앞면·성분표) 또는 글자로 편의점 제품을 넣으면 현재 주차 기준 1~10점 판정·이유·대체 추천을 주고 기록을 남기는 패스 전용 기능을 만든다. 구독 기능 공통 장치(기능별 하루 한도, 잠금 안내)도 여기서 만든다.

**Architecture:** 판정 로직(프롬프트·응답 파싱·점수 해석)은 import 없는 순수 모듈 `_shared/foodCheck.ts`에 두고, Edge Function `food-check`가 인증 → `assertPremium` → 기능별 한도 차감(`runWithQuota` 재사용) → Gemini(vision) → 기록·썸네일 저장을 한다. 앱은 `app/foodCheck/` 화면과 홈 진입 카드를 추가한다.

**Tech Stack:** Expo 53 / expo-router / NativeWind / React Query, expo-image-picker(6.0.0 빌드에 포함됨), Supabase Postgres + Edge Functions(Deno), Gemini `gemini-2.5-flash`(vision), imagescript(썸네일), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-premium-features-design.md` (§3 공통, §4 편의점 판정)

## Global Constraints
- 이용 조건은 서버에서 `has_premium_access_for(uid)`로만 판단 (`_shared/premium.ts`의 `assertPremium` / `premiumRequiredResponse` 402).
- 이용 조건이 끝나도 기록 읽기는 가능: `food_check`는 RLS(본인 행)로 직접 읽는다.
- 판매하지 않는 시기(`status.sales.onSale === false` && `!status.hasAccess`)에는 진입 카드를 숨긴다. 잠긴 상태에서 누르면 `usePremiumGate` 흐름(→ `/pass`).
- KST 자정 기준 하루. 기본 한도 `food_check = 30`, DB 설정으로 변경.
- 점수 5 이상 = `ok`("괜찮아요"), 4 이하 = `avoid`("피하세요").
- 근거 표시: 앞면 사진·글자 = "추정", 성분표 사진 = "성분표 기준".
- 인식 실패 문구: "제품명이 잘 보이게 다시 찍어주세요" (사용 횟수 되돌림).
- 한도 소진 문구: "오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요".
- 사진 원본 30일 뒤 삭제, 썸네일(긴 변 약 200px)은 유지.
- 의료 조언처럼 들리는 표현 금지.
- 모든 SQL 함수는 `security definer`, `set search_path = public`, `revoke all ... from public, anon, authenticated` 후 필요한 것만 grant (Supabase 기본 EXECUTE 부여 때문).
- Edge Function의 서비스 권한 DB 호출은 **유저 Authorization 헤더 없는** service role 클라이언트로 한다 (레시피 한도 작업에서 실제로 터졌던 문제).
- `_shared/*.ts` 순수 모듈은 import 없음 (Deno + Vitest 양쪽 로드). 테스트는 `.ts` 확장자 import.
- 커밋 꼬리말: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01RcfbJeWjkqL4kXNcqDqru2`.
- 배포(db push, functions deploy, OTA)는 Task 6에서 운영자 승인 후에만.

## Review Focus
1. **같은 사진을 연달아 두 번 보냄**(더블탭): 차감은 두 번, 판정 두 번이면 OK지만 버튼은 진행 중 비활성 → Task 4 테스트 "진행 중 재요청 무시".
2. **Gemini가 JSON 대신 설명문을 돌려줌/점수가 범위 밖(0, 11, "7점")**: 파싱 실패로 처리하고 횟수 되돌림 → Task 2 테스트.
3. **무료 기간이 판정 도중 끝남**: 서버가 요청 시점에 판단, 앱은 402면 잠금 안내 → Task 3 테스트 "402 응답 형식".
4. **아주 큰 사진(10MB+)/HEIC**: 앱에서 JPEG로 줄여 보냄, 서버는 본문 4MB 초과 거절(413) → Task 3·4.
5. **유지기(5주차+)·시작일 없음(주차 1)**: 주차 규칙 문구가 정상 → Task 2 `weekRuleText` 테스트.

---

### Task 1: DB — 기능별 하루 한도 + 판정 기록 + 저장소

**Files:**
- Create: `supabase/migrations/20261021000000_premium_food_check.sql`

**Interfaces (Produces):**
- 테이블 `premium_quota_setting(feature text pk, daily integer not null)` 시드 `('food_check', 30)`; select 정책 anon/authenticated.
- 테이블 `premium_usage(uid uuid fk public.user on delete cascade, day date, feature text, used integer default 0, pk(uid, day, feature))`, RLS on, 정책 없음.
- `consume_premium_quota(p_uid uuid, p_feature text) returns jsonb {allowed, remaining, limit}` — 레시피 한도의 `consume_recipe_quota`와 같은 패턴(upsert → `for update` → 조건부 증가). service role 전용.
- `release_premium_quota(p_uid uuid, p_feature text) returns void` (0 미만 금지). service role 전용.
- `get_premium_quota(p_feature text) returns jsonb {used, limit, remaining}` — `auth.uid()` 기준, authenticated grant.
- 테이블 `food_check(id bigserial pk, uid uuid fk cascade, input_type text check in ('front','label','text'), input_text text, image_path text, thumb_path text, product_name text, score int check 1..10, verdict text check in ('ok','avoid'), basis text check in ('estimate','label'), reasons text[], alternatives text[], week int, created_at timestamptz default now())`. RLS: 본인 select만. 인덱스 `(uid, created_at desc)`.
- Storage 버킷 `food-check` (private). 경로 `{uid}/{id}.jpg`, `{uid}/{id}_thumb.jpg`. 정책: 본인 폴더 select만 (업로드는 service role).

- [ ] **Step 1: 마이그레이션 작성** (기존 `20261020120000_recipe_quota.sql`의 함수·권한 패턴을 그대로 따른다)
- [ ] **Step 2: 검토** — `npx supabase db push --dry-run`이 이 파일 1개만 보이는지 (원격 반영은 Task 6). SQL은 Task 6 E2E에서 실제 실행 검증.
- [ ] **Step 3: Commit** `🗃️ 구독 기능 하루 한도·편의점 판정 기록 테이블 추가`

### Task 2: 판정 순수 로직 `_shared/foodCheck.ts`

**Files:**
- Create: `supabase/functions/_shared/foodCheck.ts`
- Test: `supabase/functions/tests/foodCheck/foodCheck.test.ts`

**Interfaces (Produces):**
```ts
export type FoodCheckInput = { type: 'front' | 'label'; imageBase64: string; mimeType: string } | { type: 'text'; text: string };
export interface FoodCheckResult { productName: string; score: number; verdict: 'ok' | 'avoid'; basis: 'estimate' | 'label'; reasons: string[]; alternatives: string[] }
export type ParsedFoodCheck = { status: 'ok'; result: FoodCheckResult } | { status: 'unrecognized' } | { status: 'invalid' };
export function verdictOf(score: number): 'ok' | 'avoid';            // >=5 ok
export function basisOf(type: FoodCheckInput['type']): 'estimate' | 'label';
export function weekRuleText(week: number): string;                  // 1~4주차 규칙 요약, 5+는 4주차 + "정제 탄수화물·당 주의"
export function buildFoodCheckPrompt(input: FoodCheckInput, week: number): string;
export function parseFoodCheckResponse(text: string, type: FoodCheckInput['type']): ParsedFoodCheck;
```
- 프롬프트는 JSON만 응답하게 한다: `{ recognized: boolean, productName, score(1-10 정수), reasons(1~2개), alternatives(score<=4일 때 흔한 편의점 상품 2~3개, 현재 주차에 맞는 것) }`. 의료 조언 금지 문구 포함. 주차 규칙은 `weekRuleText`, 주차별 허용 식품은 앱의 `WEEK_CHANGES`/재료 주차 기준을 요약한 상수로 둔다.
- `parseFoodCheckResponse`: 코드펜스 제거 후 JSON 파싱. `recognized:false` → unrecognized. score가 1~10 정수가 아니거나 필드 누락 → invalid. verdict·basis는 응답이 아니라 `verdictOf`/`basisOf`로 결정. `score>=5`면 alternatives는 비운다.

- [ ] **Step 1: 실패 테스트**
  - `verdictOf(5)='ok'`, `verdictOf(4)='avoid'`
  - `basisOf('label')='label'`, `basisOf('front')='estimate'`, `basisOf('text')='estimate'`
  - `weekRuleText(6)`에 4주차 규칙과 "정제 탄수화물" 포함, `weekRuleText(1)`은 1주차 규칙
  - 파싱: 정상 JSON(코드펜스 포함) → ok + verdict 계산값; `recognized:false` → unrecognized; score `0`/`11`/`"7점"`/누락 → invalid; 설명문만 → invalid; score 8이면 alternatives `[]`
  - `buildFoodCheckPrompt({type:'text', text:'참치마요 삼각김밥'}, 3)`에 입력 글자와 3주차 규칙 포함
- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/foodCheck` — FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** `✨ 편의점 판정 프롬프트·응답 해석 로직 추가`

### Task 3: Edge Function `food-check`

**Files:**
- Create: `supabase/functions/food-check/index.ts`, `supabase/functions/food-check/handler.ts`, `supabase/functions/food-check/deno.json`(다른 함수 형식 따름)
- Create: `supabase/functions/_shared/premiumQuota.ts` (순수: `parsePremiumQuota(data: unknown): {allowed:boolean; remaining:number; limit:number}`, `PREMIUM_QUOTA_EXCEEDED_MESSAGE = '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요'`)
- Modify: `supabase/config.toml` (`[functions.food-check]` verify_jwt = true), `scripts/deployEdgeFunctions.sh`
- Test: `supabase/functions/tests/foodCheck/handler.test.ts`, `supabase/functions/tests/foodCheck/premiumQuota.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC들, Task 2 함수들, `_shared/premium.ts`, `_shared/quota.ts`의 `runWithQuota`, `_shared/auth.ts`의 `requireEnv`.
- Produces: `POST /functions/v1/food-check` body `{ type: 'front'|'label', imageBase64, mimeType } | { type: 'text', text }`. 응답:
  - 200 `{ status: 'ok', check: FoodCheckRecord }` (`FoodCheckRecord` = food_check 행을 camelCase로 + `thumbUrl`(signed URL 1시간))
  - 200 `{ status: 'unrecognized', message: '제품명이 잘 보이게 다시 찍어주세요' }` (횟수 되돌림)
  - 402 `premiumRequiredResponse`, 429 `{ code: 'PREMIUM_QUOTA_EXCEEDED', error: PREMIUM_QUOTA_EXCEEDED_MESSAGE, remaining: 0 }`, 413 본문 4MB 초과, 400 잘못된 입력(text 1~50자)
- `handler.ts`는 의존성(premium check, consume/release, gemini 호출, 저장)을 인자로 받는 `handleFoodCheck(req, deps)`로 만들어 테스트한다. `index.ts`는 실제 deps를 연결해 `serve`.
- 순서: 인증 → 입력 검증 → `assertPremium` → `runWithQuota`(consume/release는 header 없는 service role 클라이언트) 안에서 Gemini 호출·파싱. `unrecognized`/`invalid`면 release 후 각각 unrecognized 응답 / 500. 저장(행 insert → 사진 업로드 원본·썸네일(imagescript로 긴 변 200px JPEG) → 행에 경로 update) 실패도 release.
- 주차는 서버에서 `user.start_date`로 계산 (앱 `getWeekAndDay`와 같은 KST 규칙; 시작일 없으면 1).

- [ ] **Step 1: 실패 테스트** (`handleFoodCheck`를 가짜 deps로)
  - 패스 없음 → 402, consume 호출 안 함
  - 한도 초과 → 429 본문 정확히 일치
  - unrecognized → 200 unrecognized + release 1회
  - Gemini invalid 응답 → 500 + release 1회
  - 저장 실패 → release 1회
  - 정상(text) → 200 ok, 저장 deps에 verdict/basis 계산값 전달
  - text 빈 문자열/51자 → 400, imageBase64 4MB 초과 → 413
  - `parsePremiumQuota(null)` throw, 정상값 통과
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: 구현**, `deno check index.ts` exit 0
- [ ] **Step 4: Run** — PASS, 전체 vitest
- [ ] **Step 5: Commit** `✨ 편의점 판정 함수 추가`

### Task 4: 앱 — 판정 화면·결과·기록

**Files:**
- Create: `api/FoodCheckAPI.ts`, `hooks/useFoodChecks.ts`, `types/foodCheck.ts`, `utils/foodCheckDisplay.ts` (+ `utils/foodCheckDisplay.test.ts`), `app/foodCheck/index.tsx`(입력+최근 기록), `app/foodCheck/[id].tsx`(결과/기록 상세), `components/foodCheck/FoodCheckResultCard.tsx`, `components/home/PremiumFeatureCards.tsx`(홈 진입 카드 묶음, 이후 기능 B·C도 여기에 카드 추가)
- Modify: `app/(tabs)/home/index.tsx`(카드 배치), `const/queryKey.ts`(`foodChecks`, `premiumQuota`)

**Interfaces:**
- Consumes: Task 3 응답 형식, `usePass`, `usePremiumGate`, `requireOnline`, `showInfoToast`.
- Produces (Plan B·C가 재사용):
  - `components/home/PremiumFeatureCards.tsx` — `export function PremiumFeatureCards(): JSX.Element | null`; 각 카드는 `{ title, description, icon, onPress }`로 렌더, 판매 안 함 && 권한 없음이면 null
  - `utils/foodCheckDisplay.ts` — `verdictLabel(v)`: ok→'괜찮아요', avoid→'피하세요'; `basisLabel(b)`: estimate→'추정', label→'성분표 기준'; `formatPremiumRemaining({remaining,limit})` → `'오늘 판정 ${remaining}/${limit}회 남았어요'`, 0이면 `'오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요'`
  - `FoodCheckAPI.check(input)`, `FoodCheckAPI.list({limit})`(food_check 직접 select + 썸네일 signed URL), `FoodCheckAPI.get(id)`
- 입력: [사진 찍기](`ImagePicker.launchCameraAsync`) / [앨범에서 고르기] / 글자 입력칸. 사진은 `expo-image-manipulator`가 없으면 `ImagePicker` 옵션 `quality: 0.6`, 최대 크기 지정으로 줄인다(새 네이티브 모듈 추가 금지). 사진 종류는 촬영 전 토글 [제품 앞면] / [성분표].
- 결과 카드: 점수(큰 숫자) + `verdictLabel` + `basisLabel` 작은 표시 + 이유 + (avoid면) 대체 추천 칩 + (estimate면) [성분표 찍고 더 정확히 보기] 버튼.
- 진행 중 버튼 비활성 + 재진입 가드, 402 → 잠금 안내(`usePremiumGate`가 하는 것처럼 `/pass`), 429 → 토스트 `PREMIUM_QUOTA_EXCEEDED_MESSAGE`.
- 스타일은 기존 컴포넌트(RippleButton, 바텀시트 카드, 레시피 생성 화면 톤)에 맞춘다.

- [ ] **Step 1: 실패 테스트** (`utils/foodCheckDisplay.test.ts`): 위 세 함수의 문구 정확히
- [ ] **Step 2: Run** — FAIL → **Step 3: 구현** (화면 포함) → **Step 4:** vitest PASS, `npx tsc --noEmit`(기존 explore 2개 외 0), `npx eslint` 변경 파일
- [ ] **Step 5: 에뮬레이터 확인** (6.0.0 개발 빌드, `scripts`로 빌드된 것): 글자 입력 판정 1회, 앨범 사진 1회, 기록 목록·상세, 오프라인 토스트 — 서버 함수는 Task 6 배포 전이므로 이 단계는 Task 6 후로 미뤄도 된다(ledger에 기록)
- [ ] **Step 6: Commit** `✨ 편의점 판정 화면과 홈 진입 카드 추가`

### Task 5: 판정 사진 원본 30일 정리

**Files:**
- Create: `supabase/functions/cleanup-food-check-images/index.ts`, `supabase/functions/_shared/foodCheckCleanup.ts`(순수: `selectExpired(rows: {id:number; image_path:string|null; created_at:string}[], now: Date, days = 30): {id:number; image_path:string}[]`)
- Create: `supabase/migrations/20261021000100_cron_cleanup_food_check.sql` (pg_cron 매일 04:30 KST, Vault `service_role_key`로 호출 — 기존 `20261019120000_cron_delete_unused_images.sql` 패턴)
- Modify: `supabase/config.toml`(verify_jwt=false + service role 헤더 확인, `delete-unused-images`와 같은 방식), deploy 스크립트
- Test: `supabase/functions/tests/foodCheck/cleanup.test.ts`

- [ ] **Step 1: 실패 테스트**: 30일 경계(정확히 30일 = 삭제, 29일 23시간 = 유지), image_path null 제외
- [ ] **Step 2~4:** 구현 → PASS. 함수는 원본 삭제 후 행의 `image_path`를 null로 (썸네일 유지)
- [ ] **Step 5: Commit** `🗑️ 편의점 판정 사진 원본 30일 정리`

### Task 6: 배포·E2E (운영자 승인 후)

- [ ] **Step 1 (승인)**: `db push --dry-run`으로 Task 1·5 마이그레이션만인지 확인 → push. `food-check`, `cleanup-food-check-images` 배포.
- [ ] **Step 2: 서버 E2E** (운영자 계정, 무료 기간 미설정 상태이므로 `user_pass`에 테스트용 만료일을 잠깐 넣고 끝나면 원복 — 실서비스 `premium_setting` 날짜는 건드리지 않음)
  - 패스 없음 → 402
  - 글자 "참치마요 삼각김밥"(2주차 가정) → 점수·이유, "닭가슴살" → ok
  - 성분표 사진 1장, 앞면 사진 1장 → basis 다름
  - 인식 불가 사진(풍경) → unrecognized, 사용량 그대로
  - `premium_quota_setting`을 2로 바꿔 3번째 → 429, 원복
  - 끝나면 테스트 `food_check` 행·Storage 파일·`premium_usage`·테스트 `user_pass` 삭제/원복
- [ ] **Step 3: 앱 확인** (Task 4 Step 5 미룬 것)
