# 재료 요청 자동 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재료 요청이 들어오면 AI가 판단·이미지 선정·DB 반영·Slack 보고까지 자동으로 처리하고, 앱은 재료 목록을 Supabase에서 읽는다.

**Architecture:** 앱은 `ingredient_request`에 insert만 한다. Supabase Database Webhook이 Edge Function `process-ingredient-request`를 호출하고, 이 함수가 `EdgeRuntime.waitUntil`로 백그라운드에서 중복 검사 → Gemini 판단(Google Search grounding) → Pixabay/Imagen 이미지 선정·검증 → Storage 업로드 → `ingredient` insert → Slack 보고를 한다. 앱은 정적 배열 대신 `ingredient` 테이블을 React Query로 읽고 AsyncStorage에 캐시한다.

**Tech Stack:** Expo 53 / React Native, `@supabase/supabase-js`, `@tanstack/react-query`, `expo-image`, Supabase Edge Functions (Deno 1, `imagescript`), Gemini API (`gemini-2.5-flash`, `imagen-4.0-fast-generate-001`), Pixabay API, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-ingredient-auto-add-design.md`

## Global Constraints

- 작업 브랜치: `dev`에서 분기한 `feature/ingredient-auto-add`. 커밋 메시지는 기존 gitmoji 스타일(예: `✨ ...`, `🍱 ...`, `🗃️ ...`)
- 재료 `week`는 1/2/3만 허용 (3 = "3주차 +"). "탄수화물" 목록(week 4)은 `is_carbohydrate`로 파생하는 화면용 카테고리이며 저장하지 않는다
- 재료명 비교는 항상 `normalizeName`(앞뒤 공백 제거 + 모든 공백 제거) 기준. 비교 대상에는 비활성 재료도 포함
- 기존 재료 행은 Edge Function이 절대 update/delete하지 않는다 (insert만)
- 확신이 낮으면 reject. 검증을 통과한 이미지가 없으면 그 재료는 추가하지 않는다
- 요청 1건당 추가 후보 최대 4개 (Edge Function 실행 시간 제한 때문에, 내 결정)
- 이미지: 640×640 정사각 center-crop JPEG quality 80 (기존 이미지가 640px 폭). 버킷 `ingredient-images` (public)
- Pixabay: `image_type=photo`, `safesearch=true`. 영어 검색 상위 5장, 결과가 3장 미만이면 한국어(`lang=ko`) 검색으로 보충. Pixabay URL을 앱에서 직접 쓰지 않는다 (반드시 Storage에 업로드)
- Imagen 생성: Pixabay 후보가 모두 탈락했을 때만, 최대 2회. 생성 이미지도 같은 검증 통과 필요
- Slack 보고는 시크릿 `INGREDIENT_SLACK_WEBHOOK_URL`로. 기존 `SLACK_WEBHOOK_URL`(문의 채널)은 건드리지 않는다
- 유저당 하루(KST) 요청 5건 제한 — DB RLS에서 강제
- 공지 "N월 N째 주"의 주 계산: KST 기준 `Math.ceil(일 / 7)` (내 결정)
- 시크릿/키를 커밋하지 않는다. 마이그레이션에 service role 키를 넣지 않는다

## Review Focus

1. **Webhook 자기 재호출**: 함수가 자기 요청의 `status`를 `added` 등으로 바꾸면 UPDATE 웹훅이 다시 온다 → 무시해야 한다 (Task 2 `getProcessMode` 테스트)
2. **같은 재료 동시 요청**: 두 유저가 거의 동시에 "치아시드"를 요청 → 먼저 생성된 pending 요청만 처리하고 나머지는 `duplicate`. `ingredient.name` unique 위반(23505)도 실패가 아니라 해당 후보 `failed`(이미 존재)로 처리 (Task 5)
3. **AI 응답이 깨짐/규칙 위반**: JSON 아님, `week` 범위 밖, 후보가 기존 재료와 동일, 후보 5개 이상 → 파싱 오류 또는 정리 후 처리, 앱에 이상한 값이 들어가지 않음 (Task 2 `parseJudgement` 테스트)
4. **첫 실행 오프라인/조회 실패**: 캐시가 있으면 캐시로 표시, 없으면 재시도 UI. 빈 목록을 "재료 없음"처럼 보여주지 않는다 (Task 7 `loadIngredientsWithCache` 테스트)
5. **저장된 선택 재료가 숨겨진/없는 재료**: 복원 시 조용히 빠지고, 남은 재료는 DB의 최신 이미지 URL을 쓴다 (Task 7 `rehydrateSelectedIngredients` 테스트)

---

## File Structure

**DB**
- Create `supabase/migrations/20261019000000_ingredient_auto_add.sql` — 테이블, RLS, 일일 제한 함수, 버킷

**Edge Function** `supabase/functions/process-ingredient-request/`
- `types.ts` — 공유 타입 (외부 import 없음)
- `core.ts` — 순수 로직: 정규화, 매칭, 웹훅 모드, 판단 파싱, 최종 상태, Slack 문구 (외부 import 없음)
- `rules.ts` — 스위치온 기준 문서 (`SWITCHON_RULES` 문자열)
- `judge.ts` — 판단 프롬프트 + Gemini 호출 (`fetch`만 사용)
- `image.ts` — Pixabay 검색, Gemini 이미지 검증, Imagen 생성, 선택 오케스트레이션 (`fetch`만 사용, 의존성 주입 가능)
- `index.ts` — Deno 진입점: supabase-js, imagescript, Storage 업로드, DB 쓰기, Slack 전송
- `deno.json`
- Tests: `supabase/functions/tests/process-ingredient-request/{core,image}.test.ts` (unit), `.../judge.integration.test.ts`, `.../image.integration.test.ts` (실제 키 필요, 없으면 skip)

**Seed**
- Create `scripts/seedIngredients.ts`, `scripts/registerAssetRequire.cjs`

**App**
- Create `api/IngredientAPI.ts`, `api/IngredientRequestAPI.ts`
- Create `utils/ingredientLists.ts`, `utils/ingredientCache.ts`, `utils/rehydrateSelectedIngredients.ts`, `utils/latestIngredientNotice.ts` (+ 각 `*.test.ts` 같은 폴더)
- Create `hooks/useIngredients.ts`
- Modify `types/recipe.ts`, `types/database.ts`, `types/database.types.ts`(재생성), `const/queryKey.ts`, `const/toastText.ts`, `const/notices.ts`
- Modify `app/index.tsx`, `app/(tabs)/home/index.tsx`, `app/(tabs)/home/recipeCreation/{low,zero}.tsx`, `components/recipeCreation/{SelectedIngredient,IngredientRequest}.tsx`, `components/common/WeekCompletePopup.tsx`, `hooks/useSelectedIngredients.ts`
- Delete (Task 10) `api/slack.ts`, `const/ingredients.ts`, `const/zeroIngredients.ts`, `assets/images/ingredients/`, `const/assets.ts`의 재료 항목, `types/env.d.ts`·`.github/workflows/eas-build-submit.yml`의 `EXPO_PUBLIC_SLACK_WEBHOOK_URL`

---

### Task 1: 브랜치 + DB 스키마

**Files:**
- Create: `supabase/migrations/20261019000000_ingredient_auto_add.sql`
- Modify: `types/database.types.ts` (재생성), `types/database.ts`

**Interfaces:**
- Produces: 테이블 `ingredient`, `ingredient_request`, 버킷 `ingredient-images`, 타입 `IngredientDB`, `IngredientRequestDB`

- [ ] **Step 1: 브랜치 생성 + 설계/계획 문서 커밋**

```bash
git switch dev && git switch -c feature/ingredient-auto-add
git add docs/superpowers && git commit -m "📝 재료 자동 추가 설계/계획 문서 추가"
```

- [ ] **Step 2: 마이그레이션 작성**

`ingredient`:
| 컬럼 | 타입 |
|---|---|
| `id` | `bigint generated always as identity primary key` |
| `name` | `text not null unique` |
| `sub_keywords` | `text[] not null default '{}'` |
| `week` | `smallint not null check (week between 1 and 3)` |
| `is_carbohydrate` | `boolean not null default false` |
| `image_url` | `text not null` |
| `image_source` | `text not null check (image_source in ('seed','pixabay','generated','manual'))` |
| `is_active` | `boolean not null default true` |
| `source` | `text not null check (source in ('seed','auto','manual'))` |
| `sort_order` | `integer not null` — 화면 표시 순서. seed는 기존 배열 순서, auto는 `max+1` |
| `request_id` | `bigint null references ingredient_request(id)` |
| `ai_reason` | `text null` |
| `created_at` | `timestamptz not null default now()` |

`ingredient_request`:
| 컬럼 | 타입 |
|---|---|
| `id` | `bigint generated always as identity primary key` |
| `uid` | `uuid not null default auth.uid() references auth.users(id) on delete cascade` |
| `name` | `text not null check (char_length(name) between 1 and 10)` |
| `normalized_name` | `text generated always as (regexp_replace(btrim(name), '\s', '', 'g')) stored` |
| `status` | `text not null default 'pending' check (status in ('pending','added','rejected','duplicate','failed'))` |
| `result` | `jsonb null` |
| `created_at` | `timestamptz not null default now()` |

`ingredient_request`를 먼저 만들고, index는 `(normalized_name)`과 `(uid, created_at)`에 둔다.

RLS:
- `ingredient`: `select` to `anon, authenticated` using `is_active`. 쓰기 정책 없음 (service role만)
- `ingredient_request`: `insert` to `authenticated` with check `uid = auth.uid() and status = 'pending' and public.ingredient_request_count_today(auth.uid()) < 5`. select/update/delete 정책 없음
- `public.ingredient_request_count_today(p_uid uuid) returns integer` — `security definer`, `set search_path = public`, KST 오늘 00:00 이후 `created_at` 개수

Storage: `insert into storage.buckets (id, name, public) values ('ingredient-images','ingredient-images', true) on conflict do nothing;` (업로드는 service role만)

- [ ] **Step 3: 원격에 적용**

Run: `npx supabase db push` (프로젝트는 이미 link 되어 있음: `supabase/.temp/project-ref`). 운영자 승인 후 실행.
Expected: 마이그레이션 1개 적용, 오류 없음.

- [ ] **Step 4: RLS 확인 (SQL Editor)**

`set role authenticated; set request.jwt.claims = '{"sub":"<테스트 uid>"}';` 상태에서 insert 6번 → 6번째가 RLS 오류. `status='added'`로 insert → RLS 오류. 확인 후 테스트 행 삭제.

- [ ] **Step 5: 타입 재생성 + 별칭 추가**

Run: `npx supabase gen types typescript --project-id "hhewuyfclrapnchhltod" --schema public > types/database.types.ts`
`types/database.ts`에 추가: `export type IngredientDB = Database['public']['Tables']['ingredient']['Row'];`, `export type IngredientRequestDB = Database['public']['Tables']['ingredient_request']['Row'];`

- [ ] **Step 6: Commit** — `🗃️ 재료/재료 요청 테이블 및 버킷 추가`

---

### Task 2: Edge Function 순수 로직 (`types.ts`, `core.ts`)

**Files:**
- Create: `supabase/functions/process-ingredient-request/types.ts`, `core.ts`
- Test: `supabase/functions/tests/process-ingredient-request/core.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type Week = 1 | 2 | 3;
export type RequestStatus = 'pending' | 'added' | 'rejected' | 'duplicate' | 'failed';
export type ImageSource = 'pixabay' | 'generated';
export interface ExistingIngredient { name: string; subKeywords: string[]; week: Week; isCarbohydrate: boolean; isActive: boolean }
export interface CandidateIngredient { name: string; week: Week; isCarbohydrate: boolean; subKeywords: string[]; imageQueryEn: string; reason: string }
export type Judgement =
  | { decision: 'add'; reason: string; ingredients: CandidateIngredient[] }
  | { decision: 'reject'; reason: string }
  | { decision: 'duplicate'; reason: string; matchedName: string };
export interface IngredientOutcome { candidate: CandidateIngredient; status: 'added' | 'failed'; imageUrl?: string; imageSource?: ImageSource; error?: string }
export interface ProcessReport { requestName: string; status: Exclude<RequestStatus, 'pending'>; reason: string; matchedName?: string; outcomes: IngredientOutcome[]; error?: string }
export interface RequestRecord { id: number; name: string; normalized_name: string; status: RequestStatus; created_at: string }
export interface WebhookPayload { type: 'INSERT' | 'UPDATE' | 'DELETE'; record: RequestRecord | null; old_record: RequestRecord | null }
```
- Produces (`core.ts`):
  - `normalizeName(name: string): string`
  - `findExactMatch(name: string, existing: ExistingIngredient[]): ExistingIngredient | null` — 정규화된 `name` 또는 `subKeywords` 일치
  - `getProcessMode(payload: WebhookPayload): 'new' | 'retry' | null` — INSERT+pending → `'new'`, UPDATE에서 `old_record.status !== 'pending'` 이고 `record.status === 'pending'` → `'retry'`, 그 외 `null`
  - `class JudgementParseError extends Error`
  - `parseJudgement(text: string, existing: ExistingIngredient[]): Judgement`
  - `decideFinalStatus(outcomes: IngredientOutcome[]): 'added' | 'failed'`
  - `formatSlackReport(report: ProcessReport): string`

- [ ] **Step 1: Write the failing tests**

```ts
describe('normalizeName', () => {
  it('removes all whitespace', () => expect(normalizeName('  닭 다리살 ')).toBe('닭다리살'));
});
describe('findExactMatch', () => {
  const existing = [
    { name: '시오콘부', subKeywords: ['염장다시마'], week: 3, isCarbohydrate: false, isActive: true },
    { name: '숨김재료', subKeywords: [], week: 1, isCarbohydrate: false, isActive: false },
  ];
  it('matches by name ignoring spaces', () => expect(findExactMatch('시오 콘부', existing)?.name).toBe('시오콘부'));
  it('matches by subKeyword', () => expect(findExactMatch('염장다시마', existing)?.name).toBe('시오콘부'));
  it('matches inactive ingredients', () => expect(findExactMatch('숨김재료', existing)?.name).toBe('숨김재료'));
  it('returns null when absent', () => expect(findExactMatch('치아씨드', existing)).toBeNull());
});
describe('getProcessMode', () => {
  const rec = (status) => ({ id: 1, name: 'a', normalized_name: 'a', status, created_at: '' });
  it('new on pending insert', () => expect(getProcessMode({ type: 'INSERT', record: rec('pending'), old_record: null })).toBe('new'));
  it('retry when operator resets to pending', () => expect(getProcessMode({ type: 'UPDATE', record: rec('pending'), old_record: rec('rejected') })).toBe('retry'));
  it('ignores own status updates', () => expect(getProcessMode({ type: 'UPDATE', record: rec('added'), old_record: rec('pending') })).toBeNull());
  it('ignores pending→pending', () => expect(getProcessMode({ type: 'UPDATE', record: rec('pending'), old_record: rec('pending') })).toBeNull());
  it('ignores delete', () => expect(getProcessMode({ type: 'DELETE', record: null, old_record: rec('pending') })).toBeNull());
});
describe('parseJudgement', () => {
  const existing = [{ name: '닭고기', subKeywords: [], week: 1, isCarbohydrate: false, isActive: true }];
  const add = (ingredients) => JSON.stringify({ decision: 'add', reason: 'r', ingredients });
  const c = (name, week = 1) => ({ name, week, isCarbohydrate: false, subKeywords: [], imageQueryEn: 'x', reason: 'r' });
  it('parses fenced json', () => expect(parseJudgement('설명\n```json\n' + add([c('닭다리살')]) + '\n```', existing).decision).toBe('add'));
  it('parses raw json', () => expect(parseJudgement(add([c('닭다리살')]), existing)).toMatchObject({ decision: 'add' }));
  it('drops candidates matching existing', () => expect(parseJudgement(add([c('닭다리살'), c('닭 고기')]), existing)).toMatchObject({ ingredients: [{ name: '닭다리살' }] }));
  it('turns add with only existing candidates into duplicate', () => expect(parseJudgement(add([c('닭고기')]), existing)).toMatchObject({ decision: 'duplicate', matchedName: '닭고기' }));
  it('keeps at most 4 candidates', () => expect((parseJudgement(add(['가','나','다','라','마'].map((n) => c(n))), existing) as any).ingredients).toHaveLength(4));
  it('dedupes candidates within the response', () => expect((parseJudgement(add([c('닭다리살'), c('닭 다리살')]), existing) as any).ingredients).toHaveLength(1));
  it('rejects week out of range', () => expect(() => parseJudgement(add([c('x', 4)]), existing)).toThrow(JudgementParseError));
  it('rejects non-json', () => expect(() => parseJudgement('모르겠어요', existing)).toThrow(JudgementParseError));
  it('rejects unknown decision', () => expect(() => parseJudgement('{"decision":"maybe","reason":"r"}', existing)).toThrow(JudgementParseError));
});
describe('decideFinalStatus', () => {
  it('added if any added', () => expect(decideFinalStatus([{ status: 'failed' }, { status: 'added' }] as any)).toBe('added'));
  it('failed if none added', () => expect(decideFinalStatus([{ status: 'failed' }] as any)).toBe('failed'));
  it('failed if empty', () => expect(decideFinalStatus([])).toBe('failed'));
});
describe('formatSlackReport', () => {
  it('added report lists ingredient, week, carb flag, image url and source', () => {
    const text = formatSlackReport({ requestName: '닭다리살', status: 'added', reason: '근거', outcomes: [{ candidate: { name: '닭다리살', week: 1, isCarbohydrate: false, subKeywords: [], imageQueryEn: '', reason: '단백질' }, status: 'added', imageUrl: 'https://x/a.jpg', imageSource: 'generated' }] });
    for (const s of ['닭다리살', '1주차', 'https://x/a.jpg', '생성', '근거']) expect(text).toContain(s);
  });
  it('failed outcome shows error', () => expect(formatSlackReport({ requestName: 'a', status: 'failed', reason: '', outcomes: [{ candidate: { name: 'a' } as any, status: 'failed', error: '맞는 이미지 없음' }] })).toContain('맞는 이미지 없음'));
  it('duplicate shows matched name', () => expect(formatSlackReport({ requestName: '고기', status: 'duplicate', reason: 'r', matchedName: '소고기', outcomes: [] })).toContain('소고기'));
});
```

- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/process-ingredient-request/core.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement `types.ts`, `core.ts`**

`parseJudgement`: ```json 펜스가 있으면 그 안의 내용을, 없으면 첫 `{`부터 마지막 `}`까지를 `JSON.parse`. 필드 검증은 직접 한다 (외부 import 금지: vitest와 Deno가 모두 import할 수 있어야 함). `subKeywords`가 없으면 `[]`로 채우고, `name`은 trim한다. Slack 문구는 이모지 헤더(✅ 추가 / 🚫 거절 / 🔁 중복 / ⚠️ 실패) + 줄바꿈 텍스트로 쓴다(`notify-inquiry` 스타일). 이미지 출처는 `Pixabay` / `AI 생성`으로 표기한다.

- [ ] **Step 4: Run tests** — Expected: PASS
- [ ] **Step 5: Commit** — `✨ 재료 요청 처리 순수 로직 추가`

---

### Task 3: 기준 문서 + Gemini 판단 (`rules.ts`, `judge.ts`)

**Files:**
- Create: `supabase/functions/process-ingredient-request/rules.ts`, `judge.ts`
- Test: `supabase/functions/tests/process-ingredient-request/judge.integration.test.ts`

**Interfaces:**
- Consumes: `ExistingIngredient`, `Judgement`, `parseJudgement` (Task 2)
- Produces:
  - `export const SWITCHON_RULES: string`
  - `buildJudgePrompt(requestName: string, existing: ExistingIngredient[]): string`
  - `judgeIngredient(requestName: string, existing: ExistingIngredient[], apiKey: string): Promise<Judgement>`

- [ ] **Step 1: `rules.ts` 작성**

나무위키 "스위치온 다이어트" 문서와 박용우 원장의 공식 자료(책/공식 안내)를 WebFetch로 확인해 한국어 마크다운으로 정리한다. 포함할 내용: 주차별 허용·금지 품목, "3주차 +"의 의미, 탄수화물(`isCarbohydrate`) 분류 기준(무탄수 레시피에서 빠지는 재료), 소스·양념 기준. 그리고 현재 `const/ingredients.ts`의 주차별 재료 이름 목록을 "기준 사례"로 붙인다. 출처 URL을 문서 상단 주석으로 남긴다. **운영자 검토 대기 표시**를 커밋 메시지에 넣는다.

- [ ] **Step 2: Write the failing integration test** (`describe.skipIf(!process.env.GEMINI_API_KEY)`, 각 케이스 timeout 60s, `dotenv/config` 사용 — 기존 `create-recipe-by-gemini.test.ts`와 같은 방식)

`existing`은 `const/ingredients.ts`에서 테스트 시작 시 만들지 않고, 테스트 파일에 대표 재료 고정 목록을 둔다: 닭고기, 닭가슴살, 소고기, 돼지고기, 치아씨드, 현미밥(week 3, carb), 시오콘부(subKeywords 염장다시마), 두부, 계란.

| 요청 | 기대 |
|---|---|
| `치아시드` | `duplicate`, matchedName `치아씨드` |
| `고기` | `duplicate` |
| `라면` | `reject` |
| `소주` | `reject` |
| `노트북` | `reject` |
| `닭다리살` | `add`, 후보에 `닭다리살` 포함, 모든 후보 `week` 1~3, 후보 중 `닭고기`·`닭가슴살` 없음 |
| `연어` | `add`, `week === 1`, `isCarbohydrate === false` |
| `고구마` | `add`, `isCarbohydrate === true` |

- [ ] **Step 3: Run** `npx vitest run supabase/functions/tests/process-ingredient-request/judge.integration.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 4: Implement `judge.ts`**

`gemini-2.5-flash` `generateContent`, `tools: [{ google_search: {} }]`. 2.5 모델에서는 grounding과 `responseSchema`를 같이 쓸 수 없으므로, 프롬프트에서 ```json 펜스로 `Judgement` 형태를 출력하도록 지시하고 `parseJudgement`로 파싱한다. 프롬프트에 넣을 것: `SWITCHON_RULES`, 기존 재료 전체(이름/별칭/주차/탄수화물, 비활성 포함), 스펙 4.3 중복 규칙 표, "애매하면 reject", 이름은 기존 재료 스타일(공백 없는 일반 한국어 명칭), 음식이 아니거나 장난성 입력은 reject, 후보 최대 4개, `imageQueryEn`은 Pixabay용 영어 키워드, `reason`은 한국어. `JudgementParseError`가 나면 1회 재시도한다. 두 번째도 실패하면 throw.

- [ ] **Step 5: Run integration test** — Expected: PASS. 실패한 케이스가 있으면 프롬프트/`rules.ts`를 고친다(테스트 기대값은 바꾸지 않는다).
- [ ] **Step 6: Commit** — `✨ 스위치온 기준 문서 및 Gemini 재료 판단 추가 (기준 문서 운영자 검토 필요)`

---

### Task 4: 이미지 선정·검증·생성 (`image.ts`)

**Files:**
- Create: `supabase/functions/process-ingredient-request/image.ts`
- Test: `supabase/functions/tests/process-ingredient-request/image.test.ts`, `image.integration.test.ts`

**Interfaces:**
- Consumes: `CandidateIngredient`, `ImageSource` (Task 2)
- Produces:
```ts
export interface PixabayHit { id: number; largeImageURL: string; webformatURL: string; tags: string }
export interface FoundImage { bytes: Uint8Array; mimeType: string; source: ImageSource }
export interface ImageDeps {
  search(query: string, lang: 'en' | 'ko'): Promise<PixabayHit[]>;
  download(url: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  verify(image: { bytes: Uint8Array; mimeType: string }, ingredientName: string): Promise<{ matches: boolean; reason: string }>;
  generate(ingredientName: string, imageQueryEn: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
}
export function createImageDeps(keys: { pixabayKey: string; geminiKey: string }): ImageDeps;
export function findIngredientImage(candidate: CandidateIngredient, deps: ImageDeps): Promise<FoundImage | null>;
```

- [ ] **Step 1: Write the failing unit tests** (fake `ImageDeps`)

```ts
it('returns first verified pixabay image without generating', ...)        // hits [a,b,c], verify: a=false, b=true → source 'pixabay', bytes of b, generate not called, verify called 2 times
it('searches korean when english has fewer than 3 hits', ...)              // en → [a], ko → [b,c]; search called with (imageQueryEn,'en') then (name,'ko')
it('checks at most 5 pixabay candidates', ...)                             // 8 hits all false → verify called 5 times for pixabay
it('falls back to generation when all pixabay fail', ...)                  // → source 'generated'
it('generates at most twice and returns null when all fail', ...)          // generate called 2 times, result null
it('skips a candidate whose download throws and continues', ...)
```

- [ ] **Step 2: Run** `npx vitest run supabase/functions/tests/process-ingredient-request/image.test.ts` — Expected: FAIL

- [ ] **Step 3: Implement**

`createImageDeps`:
- `search`: `https://pixabay.com/api/?key=&q=&image_type=photo&safesearch=true&per_page=10&lang=`
- `download`: 일반 `fetch`
- `verify`: `gemini-2.5-flash`, `inline_data` 이미지 + `responseSchema {matches: BOOLEAN, reason: STRING}`. 질문은 스펙 4.5의 2번 문장 그대로: 재료가 명확히 주인공인가, 다른 재료 위주·완성 요리·텍스트/워터마크 위주가 아닌가
- `generate`: `imagen-4.0-fast-generate-001:predict` (호출 형태는 `create-recipe-by-gemini/index.ts` 154~186행과 동일). 프롬프트는 실사, 재료 하나, 조리 전, 단순한 밝은 배경, 자연광, 텍스트 없음, 정사각 구도

- [ ] **Step 4: Run unit tests** — Expected: PASS

- [ ] **Step 5: Integration test** (`skipIf(!GEMINI_API_KEY || !PIXABAY_API_KEY)`, timeout 120s)
  - `findIngredientImage` for `{ name: '연어', imageQueryEn: 'raw salmon fillet' }` → not null, source `pixabay`
  - `findIngredientImage` for `{ name: '시오콘부', imageQueryEn: 'shio kombu salted kelp' }` → 결과 이미지를 `supabase/functions/tests/.output/`(gitignore에 추가)에 저장해서 사람이 확인한다. 결과가 null이어도 통과로 둔다
  - Run: `npx vitest run supabase/functions/tests/process-ingredient-request/image.integration.test.ts` — Expected: PASS

- [ ] **Step 6: Commit** — `✨ 재료 이미지 검색/검증/생성 로직 추가`

---

### Task 5: Edge Function 진입점 + 배포 + 웹훅

**Files:**
- Create: `supabase/functions/process-ingredient-request/index.ts`, `deno.json` (`create-recipe-by-gemini/deno.json`과 동일)
- Modify: `supabase/config.toml` (`[functions.process-ingredient-request]` 블록, `verify_jwt = true`), `scripts/deployEdgeFunctions.sh`, `scripts/testEdgeFunction.sh`

**Interfaces:**
- Consumes: Task 2~4 전부

- [ ] **Step 1: Implement `index.ts`**

`serve` 핸들러: payload 파싱 → `getProcessMode`가 `null`이면 `200 {skipped:true}`를 반환한다. 아니면 `EdgeRuntime.waitUntil(processRequest(record, mode))` 후 `202`를 반환한다.

`processRequest` 순서:
1. service role 클라이언트(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)로 `ingredient` 전체를 조회(비활성 포함)해서 `ExistingIngredient[]`로 만든다
2. `mode === 'new'`일 때만: 같은 `normalized_name`의 다른 요청 중 상태가 `added`/`duplicate`/`rejected`인 것, 또는 `pending`이면서 `created_at`이 더 이른 것이 있으면 → `duplicate` (reason "이미 처리되었거나 처리 중인 요청")
3. `findExactMatch` → `duplicate`
4. `judgeIngredient` → reject/duplicate면 그대로 보고
5. add: 후보를 **순차** 처리한다. `findIngredientImage`가 null이면 `failed`("맞는 이미지 없음"). 이미지가 있으면 imagescript로 640×640 cover-crop하고 JPEG 80으로 만든 뒤 `ingredient-images/auto/<crypto.randomUUID()>.jpg`에 업로드한다. 그다음 `ingredient`를 insert한다(`source 'auto'`, `image_source`, `request_id`, `ai_reason = candidate.reason`, `sort_order = 현재 max + 1`). insert 오류 코드 `23505`면 업로드한 파일을 지우고 `failed`("이미 존재하는 재료")로 처리한다
6. `decideFinalStatus`로 최종 상태를 정한다. `ingredient_request`를 `status`, `result = ProcessReport`로 update한다
7. `formatSlackReport` → `INGREDIENT_SLACK_WEBHOOK_URL`로 POST한다. 실패하면 `console.error`만 남긴다
- 전체를 try/catch로 감싼다. 예외가 나면 `status 'failed'`, `result.error`를 기록하고 ⚠️ Slack 보고를 보낸다

- [ ] **Step 2: 운영자 준비 확인** — Pixabay 키 발급, `rules.ts` 검토 완료 여부를 운영자에게 확인받는다

- [ ] **Step 3: 시크릿 등록 + 배포** (운영자 승인 후)

```bash
npx supabase secrets set PIXABAY_API_KEY=<키> INGREDIENT_SLACK_WEBHOOK_URL=<현재 EXPO_PUBLIC_SLACK_WEBHOOK_URL 값>
npx supabase functions deploy process-ingredient-request
```
`GEMINI_API_KEY`, `SUPABASE_*`는 이미 있다. Expected: deploy 성공.

- [ ] **Step 4: Database Webhook 생성 (운영자, 대시보드)**

Database → Webhooks → Create: name `process_ingredient_request`, table `public.ingredient_request`, events **Insert, Update**, type "Supabase Edge Functions", function `process-ingredient-request`, method POST, timeout 5000ms, Authorization 헤더는 service role(기본값).

- [ ] **Step 5: End-to-end 확인** (SQL Editor에서 service role로 insert, `uid`는 운영자 계정)

| insert name | 기대 (`ingredient_request.status`, Slack) |
|---|---|
| `치아 시드` | `duplicate`, 🔁 메시지 |
| `라면` | `rejected`, 🚫 메시지 |
| 아직 없는 적합 재료 1개(예: `꽈리고추`가 없으면 그것) | `added`, ✅ 메시지에 이미지 URL. `ingredient`에 행 생성. URL을 열면 640×640 |
| 위 `라면` 행의 status를 `pending`으로 update | 다시 처리돼서 `rejected`, Slack 1건 추가(무한 반복 없음) |

같은 이름을 연속 2번 insert하면 두 번째는 `duplicate`.

- [ ] **Step 6: Commit** — `✨ 재료 요청 자동 처리 Edge Function 추가`

---

### Task 6: 기존 재료 이전 (seed)

**Files:**
- Create: `scripts/registerAssetRequire.cjs`, `scripts/seedIngredients.ts`

- [ ] **Step 1: Implement**

- `registerAssetRequire.cjs`: `require.extensions['.jpg'|'.jpeg'|'.png'|'.webp'] = (m, filename) => { m.exports = filename; }`. 그러면 `const/assets.ts`의 `require(...)`가 파일 경로를 반환한다
- `seedIngredients.ts`: `firstWeekIngredients, secondWeekIngredients, thirdWeekIngredients`를 `const/ingredients`에서 import한다. 이 순서대로 이어 붙인 인덱스를 `sort_order`로 쓴다. 각 재료마다 원본 파일을 `ingredient-images/seed/<basename>`에 `upsert: true`로 업로드한다. 그다음 `ingredient`를 `upsert(onConflict: 'name')` 한다(`source 'seed'`, `image_source 'seed'`, `sub_keywords`, `week`, `is_carbohydrate ?? false`)
- env: `.env`의 `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`dotenv/config`). 키가 없으면 운영자에게 `.env` 추가를 요청한다
- `--dry-run`: 업로드 없이 재료 수, 이름 중복 여부, 이미지 파일 존재 여부만 출력한다. 중복이나 누락이 있으면 exit 1

- [ ] **Step 2: Dry run**

Run: `npx tsx --require ./scripts/registerAssetRequire.cjs scripts/seedIngredients.ts --dry-run`
Expected: `ingredients: <N>, duplicates: 0, missing images: 0`

- [ ] **Step 3: 실제 실행** (운영자 승인 후) — 같은 명령에서 `--dry-run`만 뺀다. Expected: `seeded <N>`

- [ ] **Step 4: 검증** — SQL `select count(*) from ingredient where source='seed'` = N. 스크립트에 `--verify` 옵션을 둔다. 모든 `image_url`에 HEAD 요청을 보내서 200인지 확인하고, 실패한 것을 출력한다. Expected: `verified <N>, failed 0`

- [ ] **Step 5: Commit** — `🍱 기존 재료를 Supabase로 이전하는 스크립트 추가`

---

### Task 7: 앱 데이터 계층

**Files:**
- Create: `api/IngredientAPI.ts`, `utils/ingredientLists.ts`, `utils/ingredientCache.ts`, `utils/rehydrateSelectedIngredients.ts`, `utils/latestIngredientNotice.ts`, `hooks/useIngredients.ts`
- Modify: `types/recipe.ts`, `const/queryKey.ts` (`ingredients` 추가)
- Test: `utils/ingredientLists.test.ts`, `utils/ingredientCache.test.ts`, `utils/rehydrateSelectedIngredients.test.ts`, `utils/latestIngredientNotice.test.ts`

**Interfaces:**
- Consumes: `IngredientDB` (Task 1)
- Produces:
```ts
// types/recipe.ts
interface Ingredient { name: string; subKeywords?: string[]; week: number; image: string; isCarbohydrate?: boolean } // image는 이제 URL
interface IngredientRecord extends Ingredient { source: 'seed' | 'auto' | 'manual'; createdAt: string; sortOrder: number }

// api/IngredientAPI.ts
IngredientAPI.selectAll(): Promise<IngredientRecord[]>          // is_active만, sort_order 오름차순, 실패 시 throw
// utils/ingredientCache.ts
saveIngredientCache(list: IngredientRecord[]): Promise<void>
loadIngredientCache(): Promise<IngredientRecord[] | null>
loadIngredientsWithCache(fetcher: () => Promise<IngredientRecord[]>): Promise<IngredientRecord[]>
// utils/ingredientLists.ts
buildLowIngredientLists(list: Ingredient[]): IngredientsProps[]      // [탄수화물(week 4), 1주차, 2주차, 3주차 +] — 현재 const/ingredients.ts의 allIngredientsList와 동일
buildAllWeekLists(list: Ingredient[]): IngredientsProps[]            // [1주차, 2주차, 3주차 +] — 현재 const/zeroIngredients.ts의 allIngredientsList와 동일
buildZeroIngredientLists(list: Ingredient[]): IngredientsProps[]     // 위와 같지만 isCarbohydrate 제외 — allZeroIngredientsList와 동일
// utils/rehydrateSelectedIngredients.ts
rehydrateSelectedIngredients(saved: Pick<Ingredient, 'name'>[], all: Ingredient[]): Ingredient[]
// utils/latestIngredientNotice.ts
getLatestIngredientNotice(list: IngredientRecord[]): { month: number; week: number; names: string[] } | null
// hooks/useIngredients.ts
useIngredients(): { ingredients: IngredientRecord[]; lowLists: IngredientsProps[]; allWeekLists: IngredientsProps[]; zeroLists: IngredientsProps[]; latestNotice: ReturnType<typeof getLatestIngredientNotice>; isLoading: boolean; isError: boolean; refetch: () => void }
prefetchIngredients(): Promise<IngredientRecord[]>
```

- [ ] **Step 1: Write the failing tests**

```ts
// ingredientLists.test.ts — fixture: [{name:'계란',week:1},{name:'현미밥',week:3,isCarbohydrate:true},{name:'두부',week:2},{name:'바나나',week:3,isCarbohydrate:true}]
it('low lists: carb first with week 4, then weeks 1-3 with titles', ...) // titles ['탄수화물','1주차','2주차','3주차 +'], weeks [4,1,2,3], 탄수화물 = ['현미밥','바나나'] (입력 순서 유지)
it('zero lists exclude carbohydrate', ...)                                // 3주차 + 목록에 현미밥/바나나 없음
it('all week lists include carbohydrate in their week', ...)              // 3주차 + = ['현미밥','바나나']

// ingredientCache.test.ts — AsyncStorage는 vi.mock('@react-native-async-storage/async-storage')로 메모리 구현
it('returns fresh data and saves it', ...)
it('returns cache when fetcher throws', ...)
it('rethrows when fetcher throws and no cache', ...)
it('does not save an empty list over a non-empty cache', ...)            // fetcher가 [] → 캐시 반환

// rehydrateSelectedIngredients.test.ts
it('replaces saved image with current one by name', ...)                  // saved {name:'계란', image: 12} → image 'https://...'
it('drops names no longer present', ...)
it('keeps saved order', ...)

// latestIngredientNotice.test.ts — createdAt은 UTC 문자열, KST 기준 계산
it('null when no auto/manual ingredients', ...)
it('groups by KST month-week of the latest one', ...)   // auto 2026-06-08T03:00Z(6/8 KST→2째 주), manual 2026-06-10T03:00Z, auto 2026-05-30 → {month:6, week:2, names:[6/8 재료, 6/10 재료]} (createdAt 오름차순)
it('uses KST date at the boundary', ...)                // 2026-06-07T16:00Z = 6/8 01:00 KST → week 2
it('ignores seed rows', ...)
```

- [ ] **Step 2: Run** `npx vitest run utils` — Expected: FAIL
- [ ] **Step 3: Implement** — `useIngredients`는 `useQueryWith402Retry({ queryKey: [QueryKey.ingredients], queryFn: () => loadIngredientsWithCache(IngredientAPI.selectAll), staleTime: 10 * 60 * 1000 })`를 쓴다. 목록은 `useMemo`로 만든다. `prefetchIngredients`는 `queryClient.fetchQuery`를 같은 key/fn으로 호출한다. KST 변환은 `utils/date.ts`의 `convertToKoreanDate`를 쓴다
- [ ] **Step 4: Run** `npx vitest run utils` — Expected: PASS
- [ ] **Step 5: Commit** — `✨ DB 재료 목록 조회/캐시 계층 추가`

---

### Task 8: 앱 화면을 DB 재료로 전환

**Files:**
- Modify: `app/index.tsx`, `app/(tabs)/home/recipeCreation/low.tsx`, `zero.tsx`, `components/recipeCreation/SelectedIngredient.tsx`, `components/common/WeekCompletePopup.tsx`, `hooks/useSelectedIngredients.ts`, `app/(tabs)/home/index.tsx`, `const/notices.ts`

**Interfaces:**
- Consumes: `useIngredients`, `prefetchIngredients`, `rehydrateSelectedIngredients` (Task 7)

- [ ] **Step 1: 교체**
  - `low.tsx`: `allIngredientsList` → `lowLists`. `zero.tsx`: `allIngredientsList` → `allWeekLists`(검색용), `allZeroIngredientsList` → `zeroLists`
  - 두 화면 모두 `isLoading`이면 기존 `Loading` 계열 스피너를, `isError`이고 목록이 비어 있으면 "재료를 불러오지 못했어요" + 다시 시도 버튼(`refetch`)을 보여준다
  - `SelectedIngredient.tsx`의 유효성 검사는 `ingredients` 기준으로 하고, 로딩 중에는 검사하지 않는다
  - `useSelectedIngredients`: 반환하는 `selectedIngredients`를 `rehydrateSelectedIngredients(data, ingredients)`로 감싼다. `ingredients`가 아직 비어 있으면 원본을 그대로 반환한다
  - `WeekCompletePopup.tsx`: `ingredients`에서 `week === 2`, `week === 3`을 filter한다
  - `app/index.tsx`: `Asset.loadAsync(ingredientImages)` 대신 `prefetchIngredients()` 후 `Image.prefetch(urls, 'disk')`(expo-image)를 쓴다. 실패해도 init을 막지 않는다(try/catch)
  - `const/notices.ts`: `latestNotices` 대신 `getLatestNotices(latestIngredient: ReturnType<typeof getLatestIngredientNotice>): string[]`를 export한다. 재료 줄은 `latestIngredient`가 null이면 생략한다. `home/index.tsx`는 `useIngredients().latestNotice`로 호출한다

- [ ] **Step 2: Verify** — `npx tsc --noEmit` 통과, `npm run lint` 통과, `npx vitest run` 통과
- [ ] **Step 3: 앱 실행 확인** (`run` 스킬 또는 `npx expo run:android`)
  - 무탄수/저탄수 화면의 재료 목록, 순서, 이미지가 이전과 같다
  - 검색(초성, `염장다시마` 별칭)이 된다
  - 기존에 저장된 선택 재료가 이미지와 함께 복원된다
  - 홈 공지에 재료 줄이 나온다(Task 5에서 추가된 재료 기준)
  - 비행기 모드로 재시작하면 캐시된 목록이 보인다
- [ ] **Step 4: Commit** — `♻️ 재료 목록을 Supabase에서 불러오도록 변경`

---

### Task 9: 재료 요청 UI를 DB로 전환

**Files:**
- Create: `api/IngredientRequestAPI.ts`
- Modify: `components/recipeCreation/IngredientRequest.tsx`, `const/toastText.ts`

**Interfaces:**
- Produces: `IngredientRequestAPI.create(name: string): Promise<'ok' | 'limit' | 'error'>` — insert `{ name: name.trim() }`. RLS 위반(code `42501`)이면 `'limit'`, 그 밖의 오류는 `captureError` 후 `'error'`

- [ ] **Step 1: Implement**
  - `IngredientRequest.tsx`: 중복 검사는 `useIngredients().ingredients`의 이름과 `subKeywords`를 `normalizeName`과 같은 규칙(공백 제거)으로 비교한다. 앱 쪽 함수는 `utils/hangul.ts` 옆에 `normalizeIngredientName`으로 둔다. 제출은 `IngredientRequestAPI.create`로 한다. `'ok'`면 `INGREDIENT_REQUEST_SUCCESS`, `'limit'`면 새 토스트 `INGREDIENT_REQUEST_LIMIT`(`{ title: '요청 한도 초과', subtitle: '재료 요청은 하루 5번까지 가능해요.' }`), `'error'`면 `INGREDIENT_REQUEST_ERROR`
  - 안내 문구: "검토 후, 스위치온 다이어트에 적합한 재료라면 추가돼요." → "스위치온 다이어트에 적합한 재료라면 자동으로 추가돼요." / "🕒 검토에는 최대 2일 정도 걸려요." → "🕒 보통 몇 분 안에 반영돼요."
- [ ] **Step 2: 앱에서 확인** — 새 재료를 요청하면 Slack에 결과가 오고, 앱을 다시 열면(또는 10분 뒤) 재료가 보인다. 같은 계정으로 6번째 요청을 보내면 한도 토스트가 뜬다
- [ ] **Step 3: Commit** — `✨ 재료 요청을 자동 처리 파이프라인으로 전송`

---

### Task 10: 번들 재료 제거 + 최종 검증

**Files:**
- Delete: `api/slack.ts`, `const/ingredients.ts`, `const/zeroIngredients.ts`, `assets/images/ingredients/`
- Modify: `const/assets.ts`(`/* 레시피 재료 */` 블록 제거), `types/env.d.ts`, `.github/workflows/eas-build-submit.yml`(`EXPO_PUBLIC_SLACK_WEBHOOK_URL` 두 줄 제거), `scripts/seedIngredients.ts`(git 히스토리에서만 실행 가능하다는 주석 추가 — 실행 대상 파일이 사라지므로)

- [ ] **Step 1: 삭제/수정 후 남은 참조 확인** — Run: `grep -rn "const/ingredients\|const/zeroIngredients\|ingredients/\|sendSlackMessage\|SLACK_WEBHOOK" app components hooks api utils const types .github` — Expected: 결과 없음
- [ ] **Step 2: 전체 검증** — `npx tsc --noEmit`, `npm run lint`, `npx vitest run` 모두 통과
- [ ] **Step 3: 앱 재실행** — Task 8 Step 3 체크리스트를 반복한다(이미지가 모두 원격에서 로드되는지 확인)
- [ ] **Step 4: Commit** — `🔥 앱 번들의 재료 데이터/이미지 및 Slack 웹훅 제거`
- [ ] **Step 5: 운영자에게 남기는 메모**
  - 구버전 앱은 여전히 `EXPO_PUBLIC_SLACK_WEBHOOK_URL`로 요청을 보낸다. 대부분 업데이트할 때까지 그 웹훅을 유지하고, 그 뒤에 교체한다. 교체하면 `INGREDIENT_SLACK_WEBHOOK_URL` 시크릿도 새 값으로 바꾼다
  - 배포는 스토어 빌드 1회(`main` 머지)로 한다
