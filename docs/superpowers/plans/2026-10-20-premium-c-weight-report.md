# 구독 전용 기능 C: 체중 기록 + AI 주간 리포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무료로 체중을 기록·그래프로 보고, 패스 이용자는 주차가 바뀌는 날 숫자 근거가 있는 AI 주간 리포트를 받는다. 리포트 재료가 되는 할 일 일별 기록과 단식 결과 기록도 새로 남긴다.

**Architecture:** 기록 테이블(체중·할 일 일별·단식 결과)은 앱이 RLS로 직접 쓴다. 주간 통계 계산은 순수 모듈 `_shared/weeklyStats.ts`, AI 문장 생성·검증은 `_shared/weeklyReport.ts`. 매일 KST 08:00 pg_cron이 `generate-weekly-reports`를 호출해 대상 유저의 리포트를 만들고 푸시하며, 09:00에는 `weight-reminder`가 알림을 켠 유저에게만 체중 기록 알림을 보낸다. 그래프는 `react-native-gifted-charts`(6.0.0 빌드에 `react-native-svg`와 함께 포함).

**Tech Stack:** Supabase Postgres + pg_cron/pg_net + Edge Functions, Gemini `gemini-2.5-flash`, Expo / React Query, react-native-gifted-charts, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-premium-features-design.md` (§3 공통, §6 체중 기록 + AI 주간 리포트)

**Depends on:** Plan A Task 4 `PremiumFeatureCards`(홈 진입), Plan B Task 4 `app/recommend.tsx`(리포트의 [추천 보기] 버튼이 조건을 미리 채워 연결). 시작 전 `feature/premium-features`를 최신 `release/6.0.0`(차트 라이브러리 커밋 포함)으로 맞춘다.

## Global Constraints
- Plan A의 Global Constraints 전체.
- 체중: kg 소수점 한 자리(20.0~300.0), 하루 1개(KST 날짜), 재입력 시 그날 값 교체, 지난 날짜 수정·삭제 가능, 어제 값 미리 채움. 무료.
- 그래프: 현재 `start_date`부터, 주차별 색 `getWeekColorHex`, 시작 체중 대비 변화량 표시, [전체 기간 보기]로 이전 기록 포함.
- 체중 알림: 기본 꺼짐. 첫 체중 입력 직후 "매일 아침 기록 알림 받을래요?" 1회 질문. 켠 유저 중 오늘 기록 없는 사람에게 09:00 KST 푸시. 설정은 서버 저장.
- 모든 기록은 날짜로 저장, 주차는 조회 시 현재 `start_date`로 계산.
- 단식 결과: 단식 시작일 기준 `success|broken`, 단식 중 또는 종료 후 48시간 안에 응답(다음 단식 시작 전까지), 무응답은 행 없음(=기록 없음).
- 할 일 달성 분모 = 그 할 일이 목록에 있었던 날 수.
- 리포트: 주차가 바뀌는 날 08:00 KST에 지난 주차분 생성, 대상 = 이용 조건 충족 + 그 주 기록 1개 이상, 무료 유저는 생성하지 않음(미리보기 카드, 판매 중일 때만). 키 `(uid, start_date, week_index)`. 이용 조건이 끝나도 지난 리포트 읽기 가능(RLS 직접).
- 리포트 고정 구성 6개(한 줄 요약 / 숫자로 본 이번 주 / 잘한 점 1 / 아쉬운 점 1 + 행동 1 / 체중 해석 / 다음 주 달라지는 점). "숫자로 본 이번 주"는 서버 계산값을 그대로 표시, AI는 나머지 문장만. AI 문장 속 숫자가 통계에 없는 값이면 그 문장을 버리고 기본 문장으로 대체.
- 체중 기록 2일 미만: 체중 해석 칸 = "체중을 2일 이상 기록하면 변화를 분석해드려요". 기록 0(체중 0일 + 할 일 체크 0일): 리포트 대신 "이번 주는 기록이 없어요".
- 탓하는 말투·의료 조언 금지.
- 푸시는 기존 `push` 함수 + `notifications` 테이블 패턴. 새 타입 `WEEKLY_REPORT`, `WEIGHT_REMINDER`.

## Review Focus
1. **주차 경계·시간대**: 일요일 23:30 KST 기록이 다음 주로 넘어가지 않음, UTC 저장값을 KST 날짜로 → Task 3 테스트.
2. **시작일 변경 직후**: 이전 리포트가 사라지지 않고 "이전 프로그램"으로 표시, 새 주차 계산이 새 시작일 기준 → Task 3·6 테스트.
3. **AI가 숫자를 지어냄**(예: "1.5kg 감량" 실제 1.2) → Task 4 검증 테스트.
4. **cron 중복 실행**(같은 날 두 번): 리포트 1개만(키 충돌 시 건너뜀), 푸시 1번 → Task 5 테스트.
5. **체중 오입력**(65 → 6.5, 650): 범위 밖 거절, 앱에서 바로 안내 → Task 2 테스트.

---

### Task 1: DB — 기록 테이블·리포트·알림 설정

**Files:**
- Create: `supabase/migrations/20261021020000_weight_report.sql`
- Modify: `types/database.types.ts`(생성 형식 맞춤), `types/database.ts`(UTF-16 LE CRLF — python으로 디코드/인코드해서 수정)

**Interfaces (Produces):**
- `weight_log(uid, day date, weight_kg numeric(4,1) check 20.0..300.0, updated_at, pk(uid,day))` — RLS 본인 select/insert/update/delete
- `todo_daily(uid, day date, items text[] not null, checked int[] not null, updated_at, pk(uid,day))` — RLS 본인 select/insert/update
- `fasting_result(uid, day date, result text check in ('success','broken'), updated_at, pk(uid,day))` — RLS 본인 전체
- `user_setting(uid pk, weight_reminder boolean not null default false, weight_reminder_asked boolean not null default false, updated_at)` — RLS 본인 전체
- `weekly_report(uid, start_date date, week_index int, stats jsonb not null, content jsonb, status text check in ('ready','empty'), created_at, pk(uid,start_date,week_index))` — RLS 본인 select만, 쓰기는 service role
- 모두 `uid` FK `public.user` on delete cascade.

- [ ] **Step 1~2:** 작성, dry-run(원격 반영은 Task 7)
- [ ] **Step 3: Commit** `🗃️ 체중·할 일·단식 기록과 주간 리포트 테이블 추가`

### Task 2: 앱 — 체중 입력·그래프 (무료)

**Files:**
- Create: `api/WeightAPI.ts`, `hooks/useWeights.ts`, `utils/weight.ts` (+ `utils/weight.test.ts`), `components/home/WeightCard.tsx`(홈 카드: 오늘 값/입력 버튼/미니 그래프), `components/weight/WeightInputSheet.tsx`(기존 `CustomBottomSheet`), `components/weight/WeightChart.tsx`(gifted-charts `LineChart`), `app/weight.tsx`(전체 그래프·기록 목록·수정/삭제·[전체 기간 보기]), `api/UserSettingAPI.ts`
- Modify: `app/(tabs)/home/index.tsx`(WeightCard 배치), `const/queryKey.ts`

**Interfaces (Produces):**
```ts
// utils/weight.ts
export function parseWeightInput(text: string): number | null;   // "65.25"→65.3(반올림), "6.5"/"650"/""/"abc" → null (20.0~300.0)
export function weightChange(logs: {day:string; weight_kg:number}[], startDate: string | null, opts?: { allPeriod?: boolean }): { first: number; last: number; diff: number } | null;
export function chartPoints(logs, startDate, opts?): { value: number; label: string; dataPointColor: string }[]; // 주차별 색 getWeekColorHex
```
- 입력 시트: 숫자 키패드, 어제 값 미리 채움, 저장 시 `weight_log` upsert(day=오늘 KST). 첫 저장이고 `weight_reminder_asked=false`면 알림 질문 모달 → 답에 따라 `user_setting` upsert (`weight_reminder`, `weight_reminder_asked=true`).
- 그래프: `LineChart` 곡선(`curved`), 점 색 주차별, 터치 시 값 표시(`pointerConfig`), 데이터 1개면 점 하나 + "기록이 2개 이상이면 그래프가 그려져요".

- [ ] **Step 1: 실패 테스트**: `parseWeightInput` 위 예시; `weightChange` 시작일 이전 기록 제외 / allPeriod 포함 / 기록 0개 null; `chartPoints` 주차 색 (시작일 기준 8일째 = 2주차 색)
- [ ] **Step 2~4:** FAIL → 구현(화면 포함) → PASS, tsc·eslint
- [ ] **Step 5: Commit** `✨ 체중 기록과 그래프 추가`

### Task 3: 리포트 재료 기록 + 주간 통계 계산 `_shared/weeklyStats.ts`

**Files:**
- Create: `supabase/functions/_shared/weeklyStats.ts` + `supabase/functions/tests/weeklyReport/weeklyStats.test.ts`
- Create: `api/TodoDailyAPI.ts`, `api/FastingResultAPI.ts`
- Modify: `hooks/useTodos.ts`(체크 변경 시 오늘 `todo_daily` upsert: items = 오늘 목록 문구, checked = 체크된 인덱스), `components/home/FastingCard.tsx`(단식 중·종료 후 48시간: [성공했어요]/[중간에 먹었어요], 응답하면 결과 표시로 바뀜), `utils/dietGuide.ts`(필요 시 `fastingResultWindow(now, fastingDays, startTime): { day: string } | null` 순수 함수 추가 + 테스트)

**Interfaces (Produces):**
```ts
export interface WeeklyInputs {
  startDate: string; weekIndex: number;            // 리포트 대상 주차
  weights: { day: string; weight_kg: number }[];   // 전체(누적 변화 계산용)
  todoDays: { day: string; items: string[]; checked: number[] }[];
  fastingPlannedDays: string[];                    // 그 주에 계획된 단식 시작일들
  fastingResults: { day: string; result: 'success'|'broken' }[];
  recipes: { created_at: string; is_zero_carb: boolean }[];
  foodChecks: { created_at: string; verdict: 'ok'|'avoid' }[];
}
export interface WeeklyStats {
  weekIndex: number; range: { from: string; to: string };    // KST 날짜
  weight: { start: number|null; end: number|null; diff: number|null; daysLogged: number; totalDiff: number|null };
  todo: { avgRate: number|null; best: { day: string; weekday: string; rate: number }|null; worst: {…}|null;
          items: { name: string; done: number; appeared: number }[] };
  fasting: { planned: number; success: number; broken: number; successWeekdays: string[] };
  recipes: { total: number; low: number; zero: number };
  foodChecks: { total: number; avoid: number };
  isEmpty: boolean;                                // 체중 0일 && 할 일 체크 0일
}
export function weekRange(startDate: string, weekIndex: number): { from: string; to: string }; // KST, 7일
export function computeWeeklyStats(input: WeeklyInputs): WeeklyStats;
```

- [ ] **Step 1: 실패 테스트**
  - `weekRange('2026-10-01', 2)` = 10-08 ~ 10-14
  - 체중: 주 첫 기록·마지막 기록·diff(소수 한 자리 반올림), 기록일 수, 시작일 대비 누적
  - 할 일: 항목별 done/appeared (단식일에 빠진 항목은 appeared에 안 셈), 평균·최고·최저 요일(한국어 요일)
  - 단식: 계획 2·성공 1·중단 0 → planned 2, success 1, 기록 없음 1은 둘 다 아님
  - 레시피·판정 개수는 `created_at`을 KST 날짜로 바꿔 범위 안만 (UTC 일요일 15:30 = KST 월요일 00:30 → 다음 주)
  - isEmpty 판정
- [ ] **Step 2~4:** FAIL → 구현(앱 기록 저장 포함) → PASS
- [ ] **Step 5: Commit** `✨ 할 일·단식 결과 기록과 주간 통계 계산 추가`

### Task 4: 리포트 문장 생성·검증 `_shared/weeklyReport.ts`

**Files:**
- Create: `supabase/functions/_shared/weeklyReport.ts` + `supabase/functions/tests/weeklyReport/weeklyReport.test.ts`

**Interfaces (Produces):**
```ts
export interface ReportContent {
  summary: string; good: string; improve: string; action: string;
  actionLink: { meal: 'breakfast'|'lunch'|'dinner' } | null;   // [추천 보기] 버튼용, 해당 없으면 null
  weightNote: string; nextWeek: string;
}
export function buildReportPrompt(stats: WeeklyStats, nextWeekChanges: string[]): string;
export function parseReportContent(text: string): ReportContent | null;
export function sanitizeContent(content: ReportContent, stats: WeeklyStats): ReportContent; // 통계에 없는 숫자가 든 문장 → 기본 문장
export function fallbackContent(stats: WeeklyStats): ReportContent;  // AI 실패 시에도 리포트가 나오게
export const WEIGHT_NOTE_TOO_FEW = '체중을 2일 이상 기록하면 변화를 분석해드려요';
```
- 다음 주 달라지는 점은 앱 `utils/dietGuide.ts`의 `WEEK_CHANGES`를 함수 쪽에 복사한 상수로 넣고, 앱 테스트로 둘이 같은지 확인 (Plan B의 BASE_TODOS 일치 테스트와 같은 방식).
- 숫자 검증: 문장에서 `\d+(\.\d+)?`를 뽑아 `stats`에 나오는 모든 숫자(체중·diff·횟수·%·요일 수 등)의 집합에 없으면 그 칸을 `fallbackContent`의 같은 칸으로 바꾼다. 1~7 사이 정수(요일 수·회수)는 허용 목록에 포함.
- daysLogged < 2면 `weightNote = WEIGHT_NOTE_TOO_FEW` 강제.

- [ ] **Step 1: 실패 테스트**: 정상 JSON 파싱; 필드 누락 → null; "1.5kg 감량"(실제 -1.2) 문장이 fallback으로 교체; 실제 숫자만 쓴 문장은 유지; daysLogged 1 → 고정 문구; `fallbackContent`가 6칸 모두 채움; 앱 `WEEK_CHANGES` 일치 테스트
- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** `✨ 주간 리포트 문장 생성·숫자 검증 로직 추가`

### Task 5: 리포트 생성·체중 알림 함수 + cron + 푸시 타입

**Files:**
- Create: `supabase/functions/generate-weekly-reports/{index.ts,handler.ts,deno.json}`, `supabase/functions/weight-reminder/{index.ts,handler.ts,deno.json}`
- Create: `supabase/migrations/20261021020100_cron_weekly_report.sql` (08:00 KST, 09:00 KST — Vault `service_role_key`, 기존 cron 마이그레이션 패턴)
- Modify: `supabase/functions/push/{index.ts,message.ts}`(타입 `WEEKLY_REPORT`·`WEIGHT_REMINDER`, 알림 클릭 시 `href`로 이동), `supabase/config.toml`, 배포 스크립트
- Test: `supabase/functions/tests/weeklyReport/generate.test.ts`, `.../reminder.test.ts`

**Interfaces:**
- `generate-weekly-reports`(service role만): 오늘(KST)이 `start_date` 기준 새 주차 1일차인 유저 = `(today - start_date) % 7 == 0 && today > start_date` → `has_premium_access_for` true인 유저만 → 지난 주차 `computeWeeklyStats` → isEmpty면 `status='empty'`로 저장(푸시 없음) → 아니면 Gemini → `parseReportContent` → `sanitizeContent` (실패 시 `fallbackContent`) → insert `on conflict do nothing` → 새로 들어간 경우에만 notifications insert(`WEEKLY_REPORT`, 제목 "N주차 리포트가 도착했어요", href `/report/{start_date}/{week_index}`).
- `weight-reminder`(service role만): `user_setting.weight_reminder = true` && 오늘 `weight_log` 없음 && push_token 있음 → notifications insert(`WEIGHT_REMINDER`, "오늘 체중을 기록해볼까요?", href `/weight`).
- 두 handler 모두 deps 주입으로 테스트.

- [ ] **Step 1: 실패 테스트**: 대상 유저 선별(주차 1일차만, 시작일 당일 제외, 비패스 제외); 이미 리포트 있음 → AI 호출·푸시 없음; AI 실패 → fallback으로 저장·푸시; isEmpty → empty 저장·푸시 없음; 알림: 꺼진 유저·기록한 유저 제외
- [ ] **Step 2~4:** FAIL → 구현 → PASS, `deno check` 세 함수(push 포함)
- [ ] **Step 5: Commit** `✨ 주간 리포트 생성·체중 알림 함수와 cron 추가`

### Task 6: 앱 — 리포트 화면·미리보기·진입

**Files:**
- Create: `app/report/index.tsx`(주차별 목록, 이전 프로그램 구분), `app/report/[startDate]/[week].tsx`(상세), `api/WeeklyReportAPI.ts`, `hooks/useWeeklyReports.ts`, `components/report/ReportStats.tsx`, `components/report/ReportPreviewCard.tsx`, `utils/reportDisplay.ts` (+ test)
- Modify: `app/profile.tsx`("나의 4주 리포트" 옆 [주간 리포트]), `components/home/PremiumFeatureCards.tsx`(리포트 카드 또는 미리보기), 알림 클릭 라우팅(기존 notifications 처리부)

**Interfaces:**
- `utils/reportDisplay.ts`:
  ```ts
  export function formatWeightDiff(diff: number | null): string;      // -1.2 → "1.2kg 감량", 0.4 → "0.4kg 증가", 0 → "변화 없음", null → "-"
  export function formatItemRate(i: {name:string; done:number; appeared:number}): string; // "아침 쉐이크 7/7"
  export function groupReportsByProgram(reports: {start_date:string; week_index:number}[], currentStartDate: string | null): { current: …[]; previous: { startDate: string; reports: …[] }[] };
  ```
- 상세 화면 순서: 한 줄 요약 → 숫자로 본 이번 주(`ReportStats`, 서버 stats 그대로) → 잘한 점 → 아쉬운 점 + 행동 + `actionLink` 있으면 [추천 보기](→ `/recommend?meal=…`, Plan B 화면이 쿼리로 조건 미리 채움) → 체중 해석 → 다음 주.
- `status='empty'`면 "이번 주는 기록이 없어요" 카드.
- 무료 유저(권한 없음, 판매 중): 홈·프로필에 `ReportPreviewCard` "이번 주 리포트를 받아보세요 · 패스 보기". 판매 안 함이면 숨김. 이미 받은 리포트는 권한과 상관없이 목록·상세 열람.

- [ ] **Step 1: 실패 테스트**: `formatWeightDiff` 4가지; `formatItemRate`; `groupReportsByProgram` 현재/이전 분리
- [ ] **Step 2~4:** FAIL → 구현 → PASS, tsc·eslint
- [ ] **Step 5: Commit** `✨ 주간 리포트 화면과 미리보기 추가`

### Task 7: 배포·E2E (운영자 승인 후)

- [ ] **Step 1 (승인)**: dry-run 확인 → push; `generate-weekly-reports`, `weight-reminder`, `push` 배포.
- [ ] **Step 2: 서버 E2E** (운영자 계정, 테스트용 `user_pass` 임시 부여 후 원복)
  - 운영자 계정에 지난 주 테스트 기록(체중 4일, todo_daily 5일, 단식 2회 중 1 성공)을 넣고 `generate-weekly-reports`를 날짜 인자로 호출(테스트용 `?today=YYYY-MM-DD`는 service role 전용으로 허용) → 리포트 1개, 숫자가 stats와 일치, 푸시 1회
  - 같은 날 재호출 → 추가 리포트·푸시 없음
  - `weight-reminder`: 알림 켠 상태·오늘 미기록 → 1회, 기록 후 → 0회
  - 끝나면 테스트 기록·리포트·알림·임시 `user_pass` 정리
- [ ] **Step 3: 앱 확인**: 체중 입력·그래프 터치, 알림 질문, 단식 결과 버튼, 리포트 상세·[추천 보기] 연결, 무료 상태 미리보기
