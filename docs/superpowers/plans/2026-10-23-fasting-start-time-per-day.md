# 단식 시작 시간 요일별 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 단식 요일마다 시작 시각(06:00~22:00, 30분 단위)을 슬라이더로 정하고, 모든 시간 계산이 요일별 시각을 쓰게 한다.

**Architecture:** 요일→분 지도(`FastingSchedule = Record<number, number>`)를 순수 모듈 `utils/fastingSchedule.ts`(앱)와 `supabase/functions/_shared/fastingSchedule.ts`(서버, 같은 내용 + 일치 테스트)에 둔다. DB는 `start_minutes jsonb`를 더하고 옛 `start_time` 라벨에서 채운다. 계산 함수들은 라벨 대신 지도를 받는다.

**Tech Stack:** Expo 53 / RN gesture-handler 2.24 + reanimated 3.17 / Supabase / Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-fasting-start-time-per-day-design.md`

## Global Constraints
- 슬라이더 범위 06:00(360)~22:00(1320), 30분 단위. 빠른 선택: 아침 식후 540, 점심 식후 780, 저녁 식후 1140. 새 요일 기본값 = 직전에 정한 시각, 없으면 1140.
- 요일 번호 0=일..6=토 (기존과 같음). 단식 길이 24시간 고정.
- 옛 라벨 호환: 읽기는 `start_minutes` 우선, 없으면 `start_time` 라벨을 모든 요일에. 쓰기는 `start_minutes`와 함께 `start_time`에 첫 요일 시각과 가장 가까운 라벨.
- 새 네이티브 의존성 금지. `npx tsc --noEmit` 오류 0, 전체 vitest 통과.
- 문구 해요체. 시각 표기 "19:00", "19:30".

## Review Focus
1. 기존 사용자(라벨만 있음)의 진행 줄·결과 질문·알림 시각이 변하지 않는다 → Task 1·2 테스트.
2. 요일마다 다른 시각일 때 결과 응답 창·다음 단식 시작 판단이 각 요일 시각 기준 → Task 2 테스트.
3. 자정을 넘는 시각(22:00 시작 → 다음날 22:00)과 KST 날짜 경계 → Task 2 테스트.
4. 서버 리포트 응답 대기 계산이 요일별 시각을 쓴다 → Task 3 테스트.
5. 슬라이더가 30분 단위로만 멈추고 범위를 넘지 않는다 → Task 4 `snapMinutes` 테스트.

---

### Task 1: 모델·DB
**Files:** Create `utils/fastingSchedule.ts` + test, `supabase/functions/_shared/fastingSchedule.ts` + app-side 일치 테스트; Create migration `supabase/migrations/20261023000000_fasting_start_minutes.sql`; Modify `types/database.types.ts`, `api/FastingAPI.ts`, `api/FastingPlanAPI.ts`, `hooks/useFasting.ts`, `hooks/useFastingPlan.ts`.
**Produces:**
```ts
export type FastingSchedule = Record<number, number>; // 요일 → 분
export const FASTING_SLIDER = { min: 360, max: 1320, step: 30 } as const;
export const QUICK_TIMES: { label: FastingTime; minutes: number }[]; // 540/780/1140
export function scheduleFrom(row: { days: number[] | null; start_time: string | null; start_minutes?: unknown }): FastingSchedule; // start_minutes 우선, 아니면 라벨을 모든 요일에, 둘 다 없으면 {}
export function legacyLabel(minutes: number): FastingTime; // 가장 가까운 라벨
export function formatMinutes(minutes: number): string; // 1140 → "19:00"
```
- 마이그레이션: 두 테이블에 `start_minutes jsonb`, 기존 행 채우기(라벨→분, days 모든 요일). RLS 변화 없음.
- `useFasting`: 반환에 `schedule: FastingSchedule` 추가, `upsertFasting({ days, schedule })`가 `start_minutes`와 `start_time`(legacyLabel(첫 요일 시각)) 저장. `useFastingPlan`/`FastingPlanAPI` 동일.
- [ ] 테스트 먼저(scheduleFrom 세 경우·잘못된 jsonb 무시, legacyLabel 경계 660/960, formatMinutes), 구현, tsc·vitest, Commit `✨ 단식 시작 시각을 요일별로 저장하는 모델과 마이그레이션`

### Task 2: 앱 시간 계산을 요일별 시각으로
**Files:** Modify `utils/dietGuide.ts`(getFastingStatus, fastingResultWindow, FastingWeekContext.previous), `utils/todayRows.ts`, `utils/fastingHistory.ts`, `utils/notifications.ts`, `components/home/{TodayChecklist,FastingProgressLine,FastingResultRow}.tsx`, `components/records/FastingHistorySection.tsx`, 관련 테스트.
- 시그니처: 라벨 `startTime` 인자를 `schedule: FastingSchedule`로 바꾼다. 시작 시각 = 그날 KST 자정 + schedule[요일]분. 알림 문구 "오늘 19:30부터 24시간 단식이 시작돼요".
- [ ] 기존 테스트를 지도 입력으로 옮기고(라벨 = 같은 분이라 결과 동일해야 함), 새 테스트: 목 13:00·토 19:00 다른 시각, 22:00 시작 자정 넘김. Commit `♻️ 단식 시간 계산을 요일별 시작 시각으로`

### Task 3: 서버 리포트
**Files:** Modify `supabase/functions/_shared/weeklyStats.ts`(fastingStartTime → schedule), `generate-weekly-reports/{handler,index}.ts`(fasting_plan.start_minutes 읽기, 없으면 start_time), 테스트.
- [ ] 테스트 먼저(요일별 시각으로 pending 판정), deno check, Commit `♻️ 주간 리포트 단식 계산을 요일별 시작 시각으로`

### Task 4: 시트 UI·슬라이더·요일 카드
**Files:** Create `components/common/StepSlider.tsx`(gesture-handler Pan + reanimated, 값 스냅, accessibilityActions), `utils/stepSlider.ts`(`snapMinutes(raw, {min,max,step})`) + test; Modify `components/home/FastingDayBottomSheet.tsx`(고른 요일마다 줄: "목요일 · 19:00 시작 → 금 19:00 끝", 슬라이더, 빠른 선택 3개; 새 요일 기본값 규칙; 저장 시 schedule), `components/home/FastingDayLine.tsx`(요일 카드 아래 문구를 요일별 "목 13:00 · 토 19:00").
- [ ] snapMinutes 테스트 먼저, 구현, tsc·eslint·vitest, 에뮬레이터 확인. Commit `✨ 단식 시작 시각을 요일마다 슬라이더로`

### Task 5: 일찍 끝낸 단식 기록
**Files:** Create migration `supabase/migrations/20261023010000_fasting_result_fasted_minutes.sql`(`fasting_result.fasted_minutes integer null check (fasted_minutes between 0 and 1440)`); Modify `types/database.types.ts`, `api/FastingResultAPI.ts`, `hooks/useFastingResult.ts`(`saveResult({ result, fastedMinutes? })`, 반환 `fastedMinutes`), `components/home/FastingProgressLine.tsx`(진행 중 "일찍 끝냈어요" 버튼 + 확인), `components/home/FastingResultRow.tsx`("일찍 끝냈어요" + 시간 슬라이더), `components/home/TodayChecklist.tsx`(이미 결과가 있으면 진행 줄 대신 결과 줄), `utils/fastingHistory.ts`·`components/records/FastingHistorySection.tsx`(시간 표시·수정), `supabase/functions/_shared/weeklyStats.ts`·`weeklyReport.ts`(fastingResults에 fastedMinutes, 일찍 끝낸 요일·시간을 통계와 허용 숫자 집합에), `generate-weekly-reports/index.ts`(fasted_minutes 읽기), 테스트.
**Consumes:** Task 2 `getFastingStatus(schedule)`의 startsAt, Task 4 `StepSlider`.
**Produces:** `utils/fastingEarlyEnd.ts` — `fastedMinutesAt(startsAt: Date, now: Date): number`(0~1440, 분 내림), `formatFastedHours(minutes: number | null): string`(990 → "16시간 30분", 960 → "16시간", null → "").
- 진행 중 버튼 → 확인 문구 "지금까지 {formatFastedHours}동안 단식했어요. 여기서 끝낼까요?" → `saveResult({ result: 'broken', fastedMinutes: fastedMinutesAt(startsAt, now) })`, day = 단식 시작일 KST.
- 끝난 뒤 "일찍 끝냈어요" → 시간 슬라이더 {min 1, max 23, step 1, 기본 16} → 저장 fastedMinutes = 시간×60.
- 결과 문구: success "성공으로 기록했어요", broken+분 "{formatFastedHours}하고 끝냈다고 기록했어요", broken+null "일찍 끝냈다고 기록했어요".
- 마이그레이션은 만들기만 하고 적용하지 않는다(운영자 승인 후 적용).
- [ ] 테스트 먼저(fastedMinutesAt 경계 0·1440 넘김·분 내림, formatFastedHours, 결과 있으면 오늘 줄이 진행 줄 대신 결과 줄, weeklyStats 일찍 끝낸 시간 집계, 리포트 허용 숫자에 시간 포함), 구현, tsc·vitest·deno check, Commit `✨ 일찍 끝낸 단식과 단식한 시간을 기록`
