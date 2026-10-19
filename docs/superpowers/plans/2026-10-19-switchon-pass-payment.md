# 스위치온 패스 (결제) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Play 일회성 상품으로 5주 "스위치온 패스"를 팔고, 서버가 만료일과 구독 전용 기능 이용 가능 여부를 판단하는 공통 장치를 만든다.

**Architecture:** 가격 구간, 구매 가능 여부, 만료일 계산은 순수 TS 모듈 하나(`supabase/functions/_shared/pass.ts`)에 모으고, Deno 함수와 Vitest가 같이 쓴다. 앱은 결제 라이브러리로 결제만 하고, 구매 토큰을 Edge Function `verify-pass-purchase`에 보낸다. 이 함수가 Google Play Developer API로 검증하고 소비(consume)하고 만료일을 기록한다. 이용 가능 여부는 DB 함수 `has_premium_access_for(uid)`가 최종 판단한다. 환불은 cron이 매일 `sync-voided-purchases`로 확인한다.

**Tech Stack:** Expo 53 / RN 0.79, Supabase (Postgres, Edge Functions on Deno 1), Google Play Developer API v3 (androidpublisher), Vitest, `@tanstack/react-query`.

**Spec:** `docs/superpowers/specs/2026-10-19-switchon-pass-payment-design.md`

## Global Constraints

- 브랜치: `feature/offline-mode`에서 분기한 `feature/switchon-pass`. 커밋은 gitmoji 스타일
- 상품 ID와 가격: `switchon_pass_5w_1900`(무료 기간 1~7일째), `switchon_pass_5w_2900`(8~14일째), `switchon_pass_5w_4900`(그 외). 통화는 KRW
- 패스 기간 `PASS_DAYS = 35`. 만료일 = 구매 시각 순서로 `max(이전 만료일, 구매 시각) + 35일` 반복 (`status = 'granted'`만)
- 날짜 기준은 KST. 무료 기간은 `free_start`~`free_end`(KST 날짜, 양끝 포함). `free_start`가 null이면 판매하지 않음
- 지난 구간 상품 유예 `GRACE_MS = 24시간`. 그 뒤 구매는 Play API로 환불하고 `status = 'refunded_ineligible'`, 패스는 주지 않음
- 서버가 최종 판단: 구독 전용 기능의 Edge Function은 `has_premium_access_for(uid)`로 막는다. 앱 판단은 표시용
- 구매는 서버에서만 소비(consume)한다. 앱은 acknowledge/consume하지 않는다 (Play는 3일 안에 처리 안 된 구매를 환불함)
- 앱은 결제 시 `obfuscatedAccountIdAndroid = Supabase uid`를 넘긴다. 서버는 이 값이 요청한 유저와 같은지 확인한다
- 결제 기록 `pass_purchase.uid`는 `on delete set null` (5년 보관). 패스 만료일 `user_pass`는 `public.user` 삭제 시 cascade
- 문구: "구독" 대신 "패스", "자동 결제 없음"을 분명히 한다
- 서비스 계정 키, 시크릿은 커밋하지 않는다. 원격 변경(db push, 시크릿, 배포, cron)은 운영자 승인 후
- 빌드는 `scripts/`의 스크립트로만 한다 (`scripts/buildDevApp.sh`, `scripts/deploy.sh`)

## Review Focus

1. **KST 자정 경계와 서버 시각**: 무료 기간 7일째 23:59 KST와 8일째 00:00 KST, 그리고 UTC 날짜가 다른 시각. 가격 구간은 서버 시각만 사용 (Task 1)
2. **결제 후 앱 종료/오프라인**: 결제는 됐는데 검증 전에 앱이 꺼지면 다음 실행 때 복구된다. 같은 토큰을 두 번 보내도 한 번만 지급된다 (Task 4, Task 7)
3. **다른 계정의 구매 토큰**: A 유저의 토큰을 B 유저가 보내면 거절 (Task 4)
4. **겹친 패스 중 하나의 환불**: 남은 구매로 재계산, 이미 다 쓴 패스가 환불되면 만료일 변화 없음 (Task 1, Task 6)
5. **구매 버튼 연타**: 결제창이 두 번 뜨지 않고, 진행 중에는 버튼이 비활성 (Task 8)

---

## File Structure

- `supabase/migrations/20261020000000_switchon_pass.sql`: `premium_setting`, `user_pass`, `pass_purchase`, `has_premium_access()`, `has_premium_access_for(uid)`
- `supabase/functions/_shared/pass.ts`: 순수 로직 (외부 import 없음)
- `supabase/functions/_shared/googlePlay.ts`: 서비스 계정 OAuth와 androidpublisher 호출 (`fetch`와 WebCrypto만 사용)
- `supabase/functions/_shared/premium.ts`: 구독 전용 기능용 `assertPremium(supabase, uid)`
- `supabase/functions/verify-pass-purchase/{index.ts,handler.ts,deno.json}`
- `supabase/functions/get-pass-status/{index.ts,deno.json}`
- `supabase/functions/sync-voided-purchases/{index.ts,handler.ts,deno.json}`
- Tests: `supabase/functions/tests/pass/{pass,googlePlay,verifyHandler,voidedHandler}.test.ts`
- App:
  - `services/billing.ts`: 결제 라이브러리 감싸기
  - `api/PassAPI.ts`, `hooks/usePass.ts`, `hooks/usePremiumGate.ts`
  - `utils/passDisplay.ts` (+ test)
  - `app/pass.tsx`: 결제 화면
  - `components/home/PassBanner.tsx`
  - `app/profile.tsx`, `app/(tabs)/home/index.tsx`, `app/_layout.tsx` 수정
  - `const/queryKey.ts`, `const/toastText.ts`

---

### Task 1: 패스 순수 로직 (`_shared/pass.ts`)

**Files:** Create `supabase/functions/_shared/pass.ts`. Test: `supabase/functions/tests/pass/pass.test.ts`

**Interfaces (Produces):**
```ts
export const PASS_DAYS = 35;
export const GRACE_MS = 24 * 60 * 60 * 1000;
export type Tier = 'early1' | 'early2' | 'regular';
export const PASS_PRODUCTS: Record<Tier, { productId: string; priceKrw: number }>;
export interface PremiumSetting { freeStart: string | null; freeEnd: string | null } // 'YYYY-MM-DD' KST
export interface SalesState {
  onSale: boolean; freeActive: boolean; tier: Tier | null; productId: string | null; priceKrw: number | null;
  freeDaysLeft: number;                       // 오늘 포함, 무료 기간 아니면 0
  nextTier: { tier: Tier; priceKrw: number; startsAt: string } | null; // ISO, 다음 가격 변경 시각
}
export function getSalesState(now: Date, setting: PremiumSetting): SalesState;
export function tierOfProduct(productId: string): Tier | null;
export function isPurchaseEligible(productId: string, purchasedAt: Date, setting: PremiumSetting): boolean;
export interface PurchaseForExpiry { purchasedAt: Date; status: 'granted' | 'voided' | 'refunded_ineligible' }
export function computeExpiry(purchases: PurchaseForExpiry[]): Date | null;
export function isFreeActive(now: Date, setting: PremiumSetting): boolean;
```

- [ ] **Step 1: Write the failing tests.** setting은 `{ freeStart: '2026-11-01', freeEnd: '2026-11-14' }`

| 테스트 | 입력 | 기대 |
|---|---|---|
| 설정 없음 | freeStart null | `onSale:false, tier:null, freeActive:false` |
| 시작 전 | `2026-10-31T15:00:00Z` (11/1 00:00 KST의 1초 전 = `2026-10-31T14:59:59Z`) | `onSale:true, freeActive:false, tier:'regular', nextTier.tier:'early1'` |
| 1일째 시작 | `2026-10-31T15:00:00Z` (11/1 00:00 KST) | `tier:'early1', freeDaysLeft:14, nextTier:{tier:'early2', startsAt:'2026-11-07T15:00:00.000Z'}` |
| 7일째 끝 | `2026-11-07T14:59:59Z` | `tier:'early1', freeDaysLeft:8` |
| 8일째 시작 | `2026-11-07T15:00:00Z` | `tier:'early2', priceKrw:2900, freeDaysLeft:7` |
| 14일째 끝 | `2026-11-14T14:59:59Z` | `tier:'early2', freeActive:true, freeDaysLeft:1` |
| 15일째 | `2026-11-14T15:00:00Z` | `tier:'regular', freeActive:false, freeDaysLeft:0, nextTier:null` |
| eligible 같은 구간 | 1900 at 11/3 | true |
| eligible 유예 안 | 1900 at `2026-11-08T14:59:59Z` (구간 종료 후 24h 직전) | true |
| eligible 유예 밖 | 1900 at `2026-11-08T15:00:00Z` | false |
| eligible 미래 구간 | 2900 at 11/2 | false |
| eligible 정가 | 4900 아무 때나 (설정 null 포함) | true |
| eligible 모르는 상품 | `'x'` | false |
| expiry 없음 | [] 또는 전부 voided | null |
| expiry 단일 | 11/1 10:00Z | 11/1 10:00Z + 35일 |
| expiry 겹침 | 11/1, 11/10 | 11/1 + 70일 |
| expiry 만료 후 재구매 | 11/1, 12/20 | 12/20 + 35일 |
| expiry 겹친 것 중 앞 것 환불 | 11/1 voided, 11/10 granted | 11/10 + 35일 |
| expiry 순서 무관 | 입력 순서 섞음 | 시각 순으로 계산한 결과와 같음 |

- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/pass/pass.test.ts`. Expected: FAIL (module not found)
- [ ] **Step 3: Implement.** KST 날짜는 `now + 9h`의 UTC 날짜로 계산한다 (외부 import 금지). 구간 종료 시각: early1 = `freeStart + 7일 00:00 KST`, early2 = `freeEnd + 1일 00:00 KST`
- [ ] **Step 4: Run.** Expected: PASS
- [ ] **Step 5: Commit**: `✨ 스위치온 패스 가격 구간/만료일 계산 로직 추가`

---

### Task 2: DB 스키마

**Files:** Create `supabase/migrations/20261020000000_switchon_pass.sql`. Modify `types/database.types.ts`(재생성), `types/database.ts`

**Interfaces (Produces):** 테이블 `premium_setting`, `user_pass`, `pass_purchase`. 함수 `has_premium_access()`, `has_premium_access_for(uuid)`. 타입 별칭 `PremiumSettingDB`, `UserPassDB`

- [ ] **Step 1: 브랜치 + 문서 커밋**
```bash
git switch feature/offline-mode && git switch -c feature/switchon-pass
git add docs/superpowers && git commit -m "📝 스위치온 패스 결제 설계/계획 문서 추가"
```
- [ ] **Step 2: 마이그레이션 작성**
  - `premium_setting`: `id smallint primary key default 1 check (id = 1)`, `free_start date`, `free_end date`, `check (free_start is null) = (free_end is null)`. 행 1개를 insert(값 null). RLS select to anon/authenticated
  - `user_pass`: `uid uuid primary key references public.user(id) on delete cascade`, `pass_expires_at timestamptz not null`, `updated_at`. RLS: authenticated select `uid = auth.uid()`
  - `pass_purchase`:
    - `id bigint identity pk`, `uid uuid references public.user(id) on delete set null`
    - `product_id text not null`, `purchase_token text not null unique`, `order_id text`, `price_krw integer`
    - `purchased_at timestamptz not null`, `granted_from timestamptz`, `granted_until timestamptz`
    - `status text not null check (status in ('granted','voided','refunded_ineligible'))`, `raw jsonb`, `created_at`
    - RLS 켜고 정책 없음 (service role만)
  - `has_premium_access_for(p_uid uuid) returns boolean`
    - `security definer`, `set search_path = public`
    - 무료 기간(`(now() at time zone 'Asia/Seoul')::date between free_start and free_end`)이거나, `user_pass.pass_expires_at > now()`
    - `revoke all ... from public, anon, authenticated` (service role만)
  - `has_premium_access() returns boolean`
    - `security definer`, `has_premium_access_for(auth.uid())` 호출
    - `grant execute to authenticated`
- [ ] **Step 3: 원격 적용 (운영자 승인 후)**: `npx supabase db push`. Expected: 마이그레이션 1개 적용
- [ ] **Step 4: 확인**
  - anon 키로 `premium_setting` 조회 → 1행, 값 null
  - anon으로 `pass_purchase` 조회 → `[]`
  - anon으로 rpc `has_premium_access_for` → 권한 오류
- [ ] **Step 5: 타입 재생성** (`scripts/updateDBType.txt`의 명령), 별칭 추가 (`types/database.ts`는 UTF-16 LE + CRLF 유지)
- [ ] **Step 6: Commit**: `🗃️ 스위치온 패스 테이블/권한 함수 추가`

---

### Task 3: Google Play API 클라이언트 (`_shared/googlePlay.ts`)

**Files:** Create `supabase/functions/_shared/googlePlay.ts`. Test: `supabase/functions/tests/pass/googlePlay.test.ts`

**Interfaces (Produces):**
```ts
export interface ServiceAccount { client_email: string; private_key: string }
export interface ProductPurchase {
  purchaseState: number; consumptionState: number; acknowledgementState: number;
  purchaseTimeMillis: string; orderId?: string; obfuscatedExternalAccountId?: string; productId?: string;
}
export interface VoidedPurchase { purchaseToken: string; orderId: string; voidedTimeMillis: string }
export function createGooglePlayClient(sa: ServiceAccount, packageName: string, fetchFn?: typeof fetch): {
  getProductPurchase(productId: string, token: string): Promise<ProductPurchase>;
  consumeProductPurchase(productId: string, token: string): Promise<void>;
  refundOrder(orderId: string): Promise<void>;                     // orders/{orderId}:refund?revoke=true
  listVoidedPurchases(startTimeMillis: number): Promise<VoidedPurchase[]>; // type=0(일회성), 페이지네이션 처리
};
```
- OAuth: JWT(RS256, scope `https://www.googleapis.com/auth/androidpublisher`, aud `https://oauth2.googleapis.com/token`). WebCrypto `importKey('pkcs8')`로 서명한다. 토큰은 만료 전까지 메모리에 캐시한다

- [ ] **Step 1: Write the failing tests** (fake `fetchFn`, 테스트 안에서 `crypto.subtle.generateKey`로 RSA 키 생성 → PKCS8 PEM)
  - `requests an access token with a signed JWT assertion`: 토큰 요청 body의 `grant_type`이 jwt-bearer. assertion 페이로드에 `iss = client_email`, `scope`, `aud`가 있고, 공개키로 서명이 검증됨
  - `reuses the cached access token`: 호출 2번에 토큰 요청은 1번
  - `calls the product purchase endpoint with the bearer token`: URL이 `.../applications/{pkg}/purchases/products/{id}/tokens/{token}`
  - `consume posts to :consume`, `refund posts to orders/{orderId}:refund?revoke=true`
  - `listVoidedPurchases follows nextPageToken`
  - `throws with status on non-2xx`: 메시지에 상태코드 포함, 토큰이나 키는 포함되지 않음
- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/pass/googlePlay.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run**. Expected: PASS
- [ ] **Step 5: Commit**: `✨ Google Play Developer API 클라이언트 추가`

---

### Task 4: `verify-pass-purchase` 함수

**Files:** Create `supabase/functions/verify-pass-purchase/{handler.ts,index.ts,deno.json}`. Modify `supabase/config.toml` (`verify_jwt = true`), `scripts/deployEdgeFunctions.sh`. Test: `supabase/functions/tests/pass/verifyHandler.test.ts`

**Interfaces:**
- Consumes: Task 1 전부, Task 3 `createGooglePlayClient`
- Produces:
```ts
export type VerifyResult =
  | { status: 'granted'; passExpiresAt: string }
  | { status: 'already_processed'; passExpiresAt: string | null }
  | { status: 'price_changed' }     // 유예 밖 → 환불함
  | { status: 'invalid' };          // 미결제, 다른 계정, 모르는 상품
export interface VerifyDeps {
  now(): Date;
  getSetting(): Promise<PremiumSetting>;
  findPurchase(token: string): Promise<{ status: string } | null>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  insertPurchase(row: PurchaseRow): Promise<'inserted' | 'duplicate'>;   // unique 위반이면 'duplicate'
  setPassExpiry(uid: string, expiresAt: Date | null): Promise<void>;      // null이면 user_pass 삭제
  play: Pick<ReturnType<typeof createGooglePlayClient>, 'getProductPurchase' | 'consumeProductPurchase' | 'refundOrder'>;
}
export function verifyPurchase(deps: VerifyDeps, input: { uid: string; productId: string; purchaseToken: string }): Promise<VerifyResult>;
```

- [ ] **Step 1: Write the failing tests** (메모리 fake deps)
  - 정상: `purchaseState 0`, 계정 일치, eligible
    - → `granted`
    - insert 1회 (`granted_from/until` 기록)
    - `setPassExpiry` = `computeExpiry` 결과
    - consume 1회
  - 이미 처리된 토큰: `findPurchase`가 존재 → `already_processed`, Play API 호출 없음
  - insert가 `duplicate`(동시 요청): `already_processed`, consume은 해도 됨
  - `purchaseState !== 0`: `invalid`, insert 없음
  - `obfuscatedExternalAccountId !== uid`: `invalid`
  - 모르는 productId: `invalid`, Play 호출 없음
  - 유예 밖 1900: refund 호출, `refunded_ineligible`로 insert, `price_changed`, 만료일 변경 없음, consume 없음
  - 패스가 남아 있을 때 재구매: 만료일이 이어 붙음 (`listUserPurchases`에 기존 구매 포함)
  - consume 실패: 결과는 `granted` 유지, 오류는 로그 (다음 복구 때 `already_processed` 경로에서 consume 재시도)
- [ ] **Step 2: Run**. Expected: FAIL
- [ ] **Step 3: Implement `handler.ts`.** `already_processed` 경로에서도 상태가 granted면 consume을 다시 시도한다 (실패한 consume 복구)
- [ ] **Step 4: Implement `index.ts`**
  - `Authorization`의 유저 토큰으로 `supabase.auth.getUser()` → uid
  - service role 클라이언트로 deps를 구성한다
  - 시크릿: `GOOGLE_PLAY_SERVICE_ACCOUNT`(JSON), `ANDROID_PACKAGE_NAME`(`com.dltjrrbs2020.switchonrecipe`)
  - `deno check index.ts`를 통과해야 한다
- [ ] **Step 5: Run tests**. Expected: PASS
- [ ] **Step 6: Commit**: `✨ 패스 구매 검증 함수 추가`

---

### Task 5: `get-pass-status` 함수 + 구독 전용 기능 가드

**Files:** Create `supabase/functions/get-pass-status/{index.ts,deno.json}`, `supabase/functions/_shared/premium.ts`. Modify `config.toml`, `scripts/deployEdgeFunctions.sh`

**Interfaces (Produces):**
- `GET/POST get-pass-status` (유저 JWT) 응답:
```ts
interface PassStatus { sales: SalesState; passExpiresAt: string | null; hasAccess: boolean; serverNow: string }
```
- `assertPremium(supabase: SupabaseClient, uid: string): Promise<void>`: 권한이 없으면 `PremiumRequiredError`(HTTP 402로 응답하게)
- 함수 본문은 Task 1과 DB 조회를 조합할 뿐이다. 로직 테스트는 Task 1이 담당한다. 여기서는 `deno check`와 Task 9의 E2E로 검증한다
- [ ] **Step 1: Implement**, `deno check` 통과
- [ ] **Step 2: Commit**: `✨ 패스 상태 조회 함수와 구독 전용 기능 가드 추가`

---

### Task 6: `sync-voided-purchases` 함수 (환불 회수)

**Files:** Create `supabase/functions/sync-voided-purchases/{handler.ts,index.ts,deno.json}`. Test: `supabase/functions/tests/pass/voidedHandler.test.ts`

**Interfaces (Produces):**
```ts
export interface VoidedDeps {
  listVoided(sinceMillis: number): Promise<VoidedPurchase[]>;
  findPurchasesByTokens(tokens: string[]): Promise<{ purchaseToken: string; uid: string | null; status: string }[]>;
  markVoided(tokens: string[]): Promise<void>;
  listUserPurchases(uid: string): Promise<PurchaseForExpiry[]>;
  setPassExpiry(uid: string, expiresAt: Date | null): Promise<void>;
}
export function syncVoided(deps: VoidedDeps, sinceMillis: number): Promise<{ voided: number; usersUpdated: number }>;
```
- [ ] **Step 1: Write the failing tests**
  - 환불된 granted 구매 → voided 표시, 해당 유저 만료일 재계산
  - 겹친 패스 중 하나 환불 → 남은 것 기준
  - 모르는 토큰은 무시한다
  - 이미 voided인 토큰은 다시 처리하지 않는다
  - uid가 null(탈퇴)이면 voided만 표시한다
  - 패스가 모두 환불되면 `setPassExpiry(uid, null)`
- [ ] **Step 2: Run**. Expected: FAIL
- [ ] **Step 3: Implement.** `index.ts`는 service role 요청만 받는다. `isServiceRoleRequest` 방식은 `process-ingredient-request/core.ts`의 것을 `_shared`로 옮겨서 함께 쓴다. 조회 범위는 최근 3일(`now - 3d`)이다
- [ ] **Step 4: Run**. Expected: PASS
- [ ] **Step 5: Commit**: `✨ 환불된 패스 회수 함수 추가`

---

### Task 7: 앱 결제 계층

**Files:**
- Create `services/billing.ts`, `api/PassAPI.ts`, `hooks/usePass.ts`, `hooks/usePremiumGate.ts`, `utils/passDisplay.ts`
- Modify `app/_layout.tsx` (복구 실행), `const/queryKey.ts` (`pass`)
- Test: `utils/passDisplay.test.ts`, `services/billing.test.ts`

**Interfaces (Produces):**
```ts
// services/billing.ts — 결제 라이브러리 의존은 이 파일에만
export function initBilling(): Promise<void>;
export function getProduct(productId: string): Promise<{ productId: string; displayPrice: string } | null>;
export function purchasePass(productId: string, uid: string): Promise<{ productId: string; purchaseToken: string } | null>; // 취소 시 null
export function getUnconsumedPassPurchases(): Promise<{ productId: string; purchaseToken: string }[]>;
export function recoverPendingPurchases(verify: (p: { productId: string; purchaseToken: string }) => Promise<unknown>): Promise<number>;
// api/PassAPI.ts
PassAPI.getStatus(): Promise<PassStatus>;
PassAPI.verify(input: { productId: string; purchaseToken: string }): Promise<VerifyResult>;
// hooks
usePass(): { status: PassStatus | undefined; isLoading: boolean; refetch(): void };
usePremiumGate(): (action: () => void) => () => void; // 권한 있으면 실행, 없으면 router.push('/pass'), 판매 중 아니면 아무 것도 안 함
// utils/passDisplay.ts
formatPassRemaining(passExpiresAt: string | null, now: Date): string | null;   // "D-12 (12월 1일까지)"
formatSalesHeadline(sales: SalesState): { price: string; original: string | null; badge: string | null; next: string | null };
```
- 라이브러리: Expo 53 / RN 0.79와 호환되는 `expo-iap` 또는 `react-native-iap` 버전을 고른다. README의 호환표를 확인하고, 선택 이유를 ledger에 남긴다. `npx expo install`로 설치한다
- [ ] **Step 1: Write the failing tests**
  - `passDisplay`
    - D-day 계산이 KST 기준이다 (`2026-12-01T14:59:59Z` 만료, now `2026-11-19T03:00Z` → "D-12")
    - 만료 → null
    - early1 → `{ price:'1,900원', original:'4,900원', badge:'61% 할인', next:'11월 8일부터 2,900원' }`
    - regular → original null
  - `billing.recoverPendingPurchases`
    - 라이브러리 모듈을 mock한다. 미소비 구매 2개 → verify 2회 호출 → 2를 반환
    - verify가 throw해도 나머지는 계속 처리한다
- [ ] **Step 2: Run** `npx vitest run utils/passDisplay.test.ts services/billing.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement.**
  - `PassAPI`는 `supabase.functions.invoke`를 쓴다
  - `recoverPendingPurchases`는 로그인 후 `app/_layout.tsx`에서 한 번 실행하고, 실행 후 `pass` 쿼리를 무효화한다
- [ ] **Step 4: Run**. Expected: PASS. `npx tsc --noEmit`는 기존 explore 오류 2개 외에 0개
- [ ] **Step 5: Commit**: `✨ 앱 결제 계층과 패스 상태 조회 추가`

---

### Task 8: 결제 화면, 홈 배너, 프로필, 탈퇴 경고

**Files:**
- Create `app/pass.tsx`, `components/home/PassBanner.tsx`
- Modify `app/(tabs)/home/index.tsx`, `app/profile.tsx`, `const/toastText.ts`

- [ ] **Step 1: Implement**
  - `app/pass.tsx`
    - 패스 설명: 5주, 자동 결제 없음, 구독 전용 기능 3개 (기능 이름은 "곧 추가돼요" 표기 허용)
    - 가격 영역: `formatSalesHeadline`
    - 무료 기간이면 "무료 기간 N일 남음"
    - 이미 패스가 있으면 남은 기간과 "연장하기"
    - 구매 버튼: 진행 중 비활성 (Review Focus 5) → `purchasePass` → `PassAPI.verify` → 결과별 토스트
      - `granted`: "패스가 활성화됐어요"
      - `price_changed`: "가격이 바뀌어 결제가 취소됐어요. 다시 시도해주세요"
      - `invalid`: 오류
    - 버튼은 `requireOnline`으로 감싼다
  - `PassBanner`: `sales.onSale && sales.freeActive`일 때만 홈에 표시. "지금 사면 61% 할인 · D-N" → `/pass`
  - 프로필
    - 패스 상태 줄: 남은 기간, 없으면 판매 중일 때 "패스 구매"
    - 탈퇴 확인 창: 패스가 남아 있으면 "남은 패스 기간(N일)도 함께 사라져요"를 추가
  - `sales.onSale === false`면 결제 화면 진입점을 모두 숨긴다
- [ ] **Step 2: Verify**: `npx tsc --noEmit`, `npm run lint`(기존 경고 외 없음), `npx vitest run --exclude "**/*.integration.test.ts" --exclude "**/integrations/**"`
- [ ] **Step 3: Commit**: `💄 스위치온 패스 결제 화면/배너/프로필 추가`

---

### Task 9: 배포와 운영자 설정, E2E

**전제:** 운영자의 사업자등록과 Play 결제 프로필 승인이 끝나야 Step 3 이후를 진행할 수 있다. 그 전에는 Step 1~2까지만 한다.

- [ ] **Step 1: 원격 반영 (운영자 승인 후)**
  - `npx supabase db push`
  - 시크릿 `ANDROID_PACKAGE_NAME`
  - `verify-pass-purchase`, `get-pass-status`, `sync-voided-purchases` 배포
  - `premium_setting`은 null로 둔다 (판매 안 함)
- [ ] **Step 2: 판매 꺼짐 확인**: 앱에서 결제 진입점이 보이지 않는다. `get-pass-status`가 `onSale:false`를 반환한다
- [ ] **Step 3: 운영자 안내 (단계별)**
  1. 결제 라이브러리가 들어간 빌드를 `scripts/deploy.sh` 또는 내부 테스트 트랙용 빌드로 업로드한다 (Play 콘솔 상품 생성의 선행 조건)
  2. 일회성 상품 3개를 만든다 (ID/가격은 Global Constraints)
  3. 라이선스 테스터를 등록한다
  4. Google Cloud 서비스 계정을 만들고, Play 콘솔 → 사용자 및 권한에서 "재무 데이터 보기, 주문 및 구독 관리" 권한을 준다
  5. JSON 키를 `GOOGLE_PLAY_SERVICE_ACCOUNT` 시크릿으로 등록한다 (운영자가 직접 `! npx supabase secrets set ...`)
  6. Supabase Cron에 `sync-voided-purchases`를 매일 04:00 KST로 등록한다
- [ ] **Step 4: E2E (라이선스 테스터, 테스트용 `premium_setting` 날짜로)**
  - 결제 → 즉시 활성화
  - 결제 직후 앱 강제 종료 → 재실행 시 복구
  - 같은 토큰 재전송 → `already_processed`
  - 다른 기기 로그인 → 유지
  - 환불(Play 콘솔 주문 관리) → 다음 날 cron 또는 수동 호출로 회수
  - 탈퇴 → 패스 사라짐, `pass_purchase.uid` null
- [ ] **Step 5: 실제 무료 기간 설정** (운영자 결정 시점): `free_start` = 배포 다음 날, `free_end` = +13일

---

## Self-Review notes

- 스펙의 "구독 전용 기능 3개" 연결은 각 기능의 계획이 `assertPremium`/`usePremiumGate`를 사용하는 것으로 끝난다 (이 계획의 범위 밖)
- RTDN은 쓰지 않는다 (스펙이 빌더 재량으로 남김, 일 1회 cron으로 충분)
