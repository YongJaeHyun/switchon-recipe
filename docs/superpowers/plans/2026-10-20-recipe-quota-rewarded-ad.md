# 레시피 생성 제한 + 보상형 광고 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유저별 하루 레시피 생성 수를 서버에서 제한하고, 무료 유저는 AdMob 보상형 광고(서버 검증)로 하루 최대 3개를 더 만들 수 있게 한다.

**Architecture:** 한도 판단과 차감은 DB 함수가 유저 행을 잠그고 원자적으로 처리한다. 레시피 생성 로직은 `_shared/createRecipe.ts`로 옮겨 `create-recipe-by-gemini`와 `create-recipe-by-gemini-test`가 같은 코드를 쓰고, 생성 전 차감 → 실패 시 되돌림을 순수 모듈 `_shared/quota.ts`가 감싼다. 광고 보상은 AdMob SSV가 Edge Function `admob-ssv`를 호출할 때만 지급하고, 서명 검증은 순수 모듈 `_shared/admobSsv.ts`가 WebCrypto로 한다. 앱은 429를 받으면 안내 모달에서 광고 시청이나 패스 안내를 보여준다.

**Tech Stack:** Supabase (Postgres, Edge Functions/Deno 1), Expo 53 / RN 0.79, `react-native-google-mobile-ads` 15.8.x, Vitest, WebCrypto (ECDSA P-256).

**Spec:** `docs/superpowers/specs/2026-10-20-recipe-quota-rewarded-ad-design.md`

## Global Constraints

- 브랜치 `feature/recipe-quota` (`feature/switchon-pass` 기반). 커밋은 gitmoji 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 한도: 무료 `free_daily = 5`, 패스 구매자 `pass_daily = 20`, 광고 보너스 `ad_bonus_daily = 3` (광고 1회 = +1). 값은 `quota_setting` DB 행에서 읽는다
- 패스 구매자 = `user_pass.pass_expires_at > now()`. **`has_premium_access_for`를 쓰지 않는다** (무료 기간은 레시피 한도와 무관)
- 하루 경계: KST 자정 (`(now() at time zone 'Asia/Seoul')::date`)
- 서버가 최종 판단. 광고 보상은 SSV로만 지급하고, 앱의 "봤어요"는 믿지 않는다
- 패스 구매자에게는 광고를 절대 보여주지 않는다
- 생성 실패 시 차감을 되돌린다
- 429 응답 본문: `{ code: 'QUOTA_EXCEEDED', error: '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.', remaining: 0, canWatchAd: boolean, isPass: boolean }` (`error`는 구버전 앱에서도 의미가 통하는 문구)
- 개발 빌드는 Google 테스트 광고 ID만 사용: 앱 ID `ca-app-pub-3940256099942544~3347511713`, 보상형 단위 `ca-app-pub-3940256099942544/5224354917`
- 실제 앱 ID·광고 단위 ID는 운영자가 전달하면 `app.config.js`/상수에 넣는다 (공개 값)
- 원격 변경(db push, 배포, 시크릿)은 운영자 승인 후. 빌드는 `scripts/`의 스크립트로

## Review Focus

1. **동시 요청**: 같은 유저가 한도 1개 남은 상태로 두 번 동시에 요청 → 하나만 통과 (DB 행 잠금) (Task 1, Task 6 E2E)
2. **생성 실패 되돌림**: Gemini 오류·이미지 실패·DB 저장 실패 시 `used`가 원래대로 (Task 2)
3. **가짜 광고 보상**: 서명 없음, 변조된 쿼리, 모르는 key_id, 재사용된 transaction_id → 지급 안 됨 (Task 3)
4. **KST 자정 경계**: 23:59 KST에 5개 쓰고 00:00 KST에 다시 5개 가능 (Task 1)
5. **패스 구매자**: 광고 버튼 미노출, 20개 소진 시 문구만 (Task 5)

---

### Task 1: DB 스키마와 한도 함수

**Files:** Create `supabase/migrations/20261020120000_recipe_quota.sql`

**Interfaces (Produces):**
- `quota_setting` (id=1 단일 행: `free_daily`, `pass_daily`, `ad_bonus_daily`, 기본 5/20/3), RLS select to anon/authenticated
- `recipe_usage` (`uid uuid references public.user(id) on delete cascade`, `day date`, `used int default 0`, `ad_bonus int default 0`, pk `(uid, day)`), RLS 켜고 정책 없음
- `ad_reward` (`transaction_id text pk`, `uid uuid references public.user(id) on delete set null`, `reward_amount int`, `ad_unit text`, `raw jsonb`, `created_at`), RLS 켜고 정책 없음
- 함수 (모두 `security definer`, `set search_path = public`, `revoke all ... from public, anon, authenticated`; 마지막 하나만 `grant execute to authenticated`):
  - `consume_recipe_quota(p_uid uuid) returns jsonb` → `{allowed, remaining, limit, isPass, canWatchAd}`. 오늘 행을 upsert 후 `select ... for update`로 잠그고, `limit = isPass ? pass_daily : free_daily + ad_bonus`, `used < limit`이면 `used += 1`. `canWatchAd = not isPass and ad_bonus < ad_bonus_daily`
  - `release_recipe_quota(p_uid uuid) returns void` → 오늘 `used = greatest(used - 1, 0)`
  - `grant_ad_bonus(p_uid uuid, p_transaction_id text, p_reward_amount int, p_ad_unit text, p_raw jsonb) returns text` → `'granted' | 'duplicate' | 'limit' | 'pass'`. transaction_id insert(중복이면 `'duplicate'`), 패스 구매자면 `'pass'`(기록만), 오늘 `ad_bonus < ad_bonus_daily`면 `+1` 후 `'granted'`, 아니면 `'limit'`
  - `get_recipe_quota() returns jsonb` (auth.uid()) → `{used, limit, remaining, adBonusLeft, isPass}`

- [ ] **Step 1: 마이그레이션 작성** (기존 `20261020000000_switchon_pass.sql`의 스타일·권한 패턴 그대로)
- [ ] **Step 2: SQL 자가 점검**: 각 함수가 오늘 행이 없을 때·있을 때 동작, `for update` 잠금 위치, KST 날짜 계산이 `now() at time zone 'Asia/Seoul'`로 통일됐는지
- [ ] **Step 3: Commit** `🗃️ 레시피 생성 한도·광고 보상 테이블과 함수 추가`

(원격 적용과 SQL 동작 확인은 Task 6)

---

### Task 2: 레시피 생성 공용화 + 한도 적용

**Files:**
- Create `supabase/functions/_shared/quota.ts` (순수, import 없음), `supabase/functions/_shared/createRecipe.ts` (기존 `create-recipe-by-gemini/index.ts` 본문 이동)
- Modify `supabase/functions/create-recipe-by-gemini/index.ts`, `supabase/functions/create-recipe-by-gemini-test/index.ts` (둘 다 `serve(handleCreateRecipe)`만), `supabase/config.toml`(test 함수 블록, `verify_jwt = true`), `scripts/deployEdgeFunctions.sh`
- Test: `supabase/functions/tests/quota/quota.test.ts`

**Interfaces (Produces):**
```ts
// _shared/quota.ts
export interface QuotaDecision { allowed: boolean; remaining: number; limit: number; isPass: boolean; canWatchAd: boolean }
export const QUOTA_EXCEEDED_MESSAGE = '오늘 레시피를 모두 만들었어요. 내일 다시 만들 수 있어요.';
export function quotaExceededBody(d: QuotaDecision): { code: 'QUOTA_EXCEEDED'; error: string; remaining: 0; canWatchAd: boolean; isPass: boolean };
export function runWithQuota<T>(deps: { consume(): Promise<QuotaDecision>; release(): Promise<void> }, generate: () => Promise<T>):
  Promise<{ status: 'ok'; value: T } | { status: 'exceeded'; decision: QuotaDecision }>;
// generate가 throw하면 release 후 같은 오류를 다시 throw. release 자체 실패는 로그만 남기고 원래 오류를 throw
// _shared/createRecipe.ts
export function handleCreateRecipe(req: Request): Promise<Response>;
```
- 이미지 생성은 실서비스 코드(`gemini-3.1-flash-image`) 기준. 테스트 함수의 Imagen 4 코드는 버린다
- `consume`/`release`는 service role 클라이언트로 `consume_recipe_quota`/`release_recipe_quota` rpc. 유저 확인(기존 `auth.getUser`) 뒤, 생성 전에 차감

- [ ] **Step 1: Write the failing tests** (`quota.test.ts`)
  - 허용 → generate 실행, release 없음, `{status:'ok'}`
  - 거절 → generate 미실행, `{status:'exceeded', decision}`
  - generate throw → release 1회, 같은 오류 rethrow
  - generate와 release 모두 throw → 원래 generate 오류 rethrow
  - `quotaExceededBody`가 전역 제약의 본문과 정확히 같음
- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/quota/quota.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `quota.ts`, 기존 본문을 `createRecipe.ts`로 옮기고 `runWithQuota`로 감싸기. 초과 시 429 + `quotaExceededBody`
- [ ] **Step 4: Run tests** — PASS. `deno check index.ts` (두 함수 모두) exit 0
- [ ] **Step 5: Commit** `✨ 레시피 생성 하루 한도 적용 (실서비스·테스트 함수 공용화)`

---

### Task 3: AdMob SSV 검증 + `admob-ssv` 함수

**Files:**
- Create `supabase/functions/_shared/admobSsv.ts` (순수, `fetch`·WebCrypto만), `supabase/functions/admob-ssv/{index.ts,deno.json}`
- Modify `supabase/config.toml` (`[functions.admob-ssv]`, **`verify_jwt = false`**), `scripts/deployEdgeFunctions.sh`
- Test: `supabase/functions/tests/quota/admobSsv.test.ts`

**Interfaces (Produces):**
```ts
export interface SsvKey { keyId: number; pem: string }
export interface SsvParams { adUnit: string; rewardAmount: number; rewardItem: string; transactionId: string; userId: string | null; keyId: number; signature: string }
export function parseSsvQuery(rawQuery: string): { params: SsvParams; signedMessage: string } | null; // signedMessage = 'signature=' 앞까지 (끝의 & 제외)
export function derToRawEcdsa(der: Uint8Array): Uint8Array; // 64바이트 r||s
export function verifySsv(rawQuery: string, keys: SsvKey[]): Promise<SsvParams | null>; // 서명 맞으면 params
export function createKeyFetcher(fetchFn?: typeof fetch, ttlMs?: number): () => Promise<SsvKey[]>; // https://www.gstatic.com/admob/reward/verifier-keys.json, 메모리 캐시
```
- `index.ts`: GET 쿼리 문자열 그대로 `verifySsv` → 실패 시 400. 성공 시 `userId`가 UUID가 아니면 200 + 기록 안 함(AdMob 콘솔의 확인용 요청 대비). 그 외 `grant_ad_bonus` rpc → 결과와 무관하게 200 (Google 재시도 방지). 키 조회 실패는 500 (Google이 재시도)
- 키 캐시: 24시간. key_id가 캐시에 없으면 한 번 새로 받아서 재시도

- [ ] **Step 1: Write the failing tests** — 테스트 안에서 `crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'})`로 키 생성, 공개키를 SPKI PEM으로 내보내 `SsvKey`로 만들고, 메시지를 raw 서명 후 DER로 변환해 base64url로 쿼리를 구성
  - 올바른 서명 → params 반환 (값 매핑 확인)
  - 쿼리 값 하나 변조 → null
  - 모르는 key_id → null
  - signature/key_id 누락 → null
  - `derToRawEcdsa`: r/s 앞 0x00 패딩·짧은 값 모두 32바이트로 맞춤
  - `createKeyFetcher`: 두 번 호출에 fetch 1회 (캐시)
- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/quota/admobSsv.test.ts` — FAIL
- [ ] **Step 3: Implement**, `deno check` 통과
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** `✨ AdMob 보상형 광고 서버 검증(SSV) 함수 추가`

---

### Task 4: 앱 한도 조회·429 처리·광고 계층

**Files:**
- Create `api/RecipeQuotaAPI.ts`, `hooks/useRecipeQuota.ts`, `services/ads.ts`, `utils/recipeQuota.ts` (+ test), `const/ads.ts`
- Modify `api/gemini.ts` (429를 구분해 반환), `const/queryKey.ts` (`recipeQuota`), `package.json` (`npx expo install react-native-google-mobile-ads` 15.8.x), `app.config.js` (플러그인 `['react-native-google-mobile-ads', { androidAppId }]`, 개발은 테스트 앱 ID)

**Interfaces (Produces):**
```ts
// api/gemini.ts
createRecipe(...): Promise<Maybe<RecipeDB> | { quotaExceeded: true; canWatchAd: boolean; isPass: boolean }>
// 기존 토스트 처리는 유지하되 429는 토스트 없이 위 객체 반환
// api/RecipeQuotaAPI.ts
RecipeQuotaAPI.get(): Promise<{ used: number; limit: number; remaining: number; adBonusLeft: number; isPass: boolean }>
// services/ads.ts — 라이브러리 사용은 이 파일에만, 동적 import로 네이티브 모듈 없으면 AdsUnavailableError
showRewardedAd(uid: string): Promise<'earned' | 'closed'>; // SSV userId = uid
isAdsAvailable(): Promise<boolean>;
// utils/recipeQuota.ts
formatRemaining(q): string | null;          // 무료: "오늘 N개 남았어요", 패스: remaining ≤ 5일 때만
getQuotaModalActions(input: { isPass: boolean; canWatchAd: boolean; onSale: boolean; adsAvailable: boolean }): ('watchAd' | 'pass')[];
waitForAdBonus(get: () => Promise<{ remaining: number }>, opts?: { tries?: number; intervalMs?: number }): Promise<boolean>; // remaining > 0 될 때까지
```
- [ ] **Step 1: Write the failing tests** (`utils/recipeQuota.test.ts`)
  - `getQuotaModalActions`: 패스 → `[]` / 무료+광고 가능+판매중 → `['watchAd','pass']` / 광고 소진 → `['pass']` / 광고 모듈 없음 → `watchAd` 제외 / 판매 안 함 → `pass` 제외
  - `formatRemaining`: 무료 3 → "오늘 3개 남았어요", 패스 12 → null, 패스 4 → "오늘 4개 남았어요"
  - `waitForAdBonus`: 3번째에 반영 → true, 끝까지 0 → false (가짜 타이머)
- [ ] **Step 2: Run** `npx vitest run utils/recipeQuota.test.ts` — FAIL
- [ ] **Step 3: Implement** (광고 단위 ID는 `const/ads.ts`: `__DEV__`면 테스트 ID, 아니면 운영 ID 상수 — 운영 ID 미정이면 `null`로 두고 광고 비활성)
- [ ] **Step 4: Run** — PASS, `npx tsc --noEmit` (기존 explore 2개 외 0)
- [ ] **Step 5: Commit** `✨ 앱 레시피 한도 조회·보상형 광고 계층 추가`

---

### Task 5: 화면 (한도 모달, 남은 수)

**Files:** Create `components/recipeCreation/QuotaExceededModal.tsx`. Modify `app/(tabs)/home/recipeCreation/{low,zero}.tsx`

- [ ] **Step 1: Implement**
  - 두 화면의 생성 결과가 `quotaExceeded`면 모달. 문구: 제목 "오늘 레시피를 모두 만들었어요", 본문 "내일 다시 만들 수 있어요."
  - 버튼: `getQuotaModalActions` 결과대로 **[광고 보고 1개 더 만들기]** (green-600) / **[패스 보기]** (`/pass`) / **[닫기]**
  - 광고 흐름: `showRewardedAd(uid)` → `'earned'`면 로딩 표시하며 `waitForAdBonus` → true면 같은 조건으로 레시피 생성 자동 재시도, false면 토스트 "보상 확인이 늦어지고 있어요. 잠시 후 다시 시도해주세요." `'closed'`면 아무것도 안 함
  - 진행 중 버튼 비활성 + 재진입 가드
  - 생성 버튼 근처에 `formatRemaining` (값이 있을 때만), 생성·광고 후 `recipeQuota` 쿼리 무효화
  - 모달 스타일은 기존 `ConfirmModal`/`WeekCompletePopup`과 맞춘다
- [ ] **Step 2: Verify** `npx tsc --noEmit`, `npm run lint`(새 문제 없음), 전체 vitest
- [ ] **Step 3: Commit** `💄 레시피 한도 초과 모달과 남은 횟수 표시`

---

### Task 6: 반영과 운영자 설정

- [ ] **Step 1 (승인 후)**: `npx supabase db push` (이 마이그레이션 1개인지 dry-run 확인), `create-recipe-by-gemini`, `create-recipe-by-gemini-test`, `admob-ssv` 배포
- [ ] **Step 2: 서버 E2E** (운영자 계정 uid, service role rpc)
  - `consume_recipe_quota` 6번 → 5번 allowed, 6번째 false·canWatchAd true
  - `grant_ad_bonus`(새 transaction_id) → granted, 같은 id 재호출 → duplicate, 4번째 → limit
  - 동시 2요청(remaining 1) → allowed 1개
  - 끝나면 운영자 계정의 오늘 `recipe_usage`, 테스트 `ad_reward` 행 삭제
  - `admob-ssv`에 서명 없는 요청 → 400
- [ ] **Step 3: 운영자 안내**: AdMob 보상형 광고 단위의 SSV 콜백 URL에 `https://hhewuyfclrapnchhltod.supabase.co/functions/v1/admob-ssv` 입력·확인, 앱 ID·광고 단위 ID 전달 → `const/ads.ts`, `app.config.js` 반영 커밋
- [ ] **Step 4: 앱 확인**: 결제와 같은 6.0.0 개발 빌드(`scripts/buildDevApp.sh`)에서 테스트 광고로 모달·광고·재시도 확인
