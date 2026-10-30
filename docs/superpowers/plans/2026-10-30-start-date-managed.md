# 시작일 앱 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 날짜 선택을 없애고 '처음부터 다시 시작'과 '주차 맞추기' 두 동작으로 시작일을 앱이 계산한다.

**Architecture:** 시작일 계산·변경을 `utils/programStart.ts`(순수) + `hooks/useChangeStartDate.ts`(부수효과: 재료 정리, 통계 삭제, 쿼리 무효화, API) 한 곳으로 모으고, 설정 시트·온보딩·한 주 더 하기가 이를 쓴다.

**Tech Stack:** Expo 53 / zustand / React Query / Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-start-date-managed-design.md`

## Global Constraints
- 서버·DB 변경 금지. 새 네이티브 의존성 금지.
- 사용자가 날짜를 직접 고르는 UI를 앱에서 없앤다(`CustomCalendar` 사용처: 시작일 시트, 온보딩 3단계). 다른 용도 사용처가 있으면 남긴다.
- 주차 맞추기: 시작일 = 오늘(KST) − ((주차−1)×7 + (일−1))일, 유지기 = 5주차 1일. 미래 시작 불가.
- 처음부터 다시 시작: 내일(추천)/오늘, 시트 안 확인 단계 1회, 네이티브 Alert 금지. 문구는 사실대로(체중 기록·리포트는 남음).
- UI 작업은 반드시 Skill 도구로 `frontend-design:frontend-design`을 먼저 불러 따른다.
- `npx tsc --noEmit` 0, 전체 vitest 통과, 변경 파일 eslint·prettier.

## Review Focus
1. 세 경로(설정, 온보딩, 한 주 더 하기)가 같은 시작일 변경 함수를 쓰고 정리 동작이 같다.
2. 주차 맞추기 경계: 1주차 1일=오늘, 유지기, KST 자정, 기기 시간대가 KST 아님.
3. 내일부터 다시 시작 → 시작 전 상태(BeforeStartCard, 준비 체크 새로, 1일차 아침 알림)로 정상 진입.
4. 다시 시작 후 주차 팝업·한 주 더 키·끼니 알림이 새 차수 기준으로 동작.
5. 실패 시(API 오류) 부분 상태 없음.

---

### Task 1: 시작일 변경 한 곳으로 + 프로그램 설정 시트
**Files:** Modify `utils/programStart.ts`(+test) — `startDateForWeekDay(today: string, week: number, day: number): string`, `restartStartDate(today, when: 'today'|'tomorrow'): string`; Create `hooks/useChangeStartDate.ts` — `changeStartDate(newStart, { toast? }): Promise<boolean>` (기존 StartDateBottomSheet.updateStartDate 정리 로직 + `UserAPI.updateStartDate`); Modify `hooks/useWeekRepeat.ts`(같은 함수 사용); Replace `components/home/StartDateBottomSheet.tsx` 내용 → 프로그램 설정 시트(다시 시작 + 주차 맞추기, 확인 단계); Create `components/program/WeekDayPicker.tsx`(주차 칩 1~4·유지기 + 일차 칩 1~7, 주차 색).
- [ ] 테스트 먼저, 구현, 에뮬레이터 스크린샷(설정 시트 기본/다시 시작 확인/주차 맞추기 — 저장 버튼 누르지 말 것), Commit `✨ 시작일은 앱이 관리: 다시 시작·주차 맞추기`

### Task 2: 온보딩 달력 → 주차 맞추기
**Files:** Modify `app/(auth)/onboard.tsx`(3단계 달력 → `WeekDayPicker`, 시작일 계산은 `startDateForWeekDay`), 마지막 단계 문구 확인.
- [ ] 테스트(가능한 순수 부분), 구현, 스크린샷(온보딩 3단계 — 딥링크로 열고 완료하지 말 것), Commit `✨ 온보딩에서도 주차로 시작 맞추기`

### Task 3: 회차 시작일(program_start) + 단식 기록 연도·지난 회차
운영자 결정(2026-10-30): 한 주 더 하기·주차 맞추기로 start_date가 바뀌어도 같은 회차로 본다.
**Files:** Create `supabase/migrations/20261030030000_user_program_start.sql` — `alter table public.user add column if not exists program_start date;` + 기존 행 `update ... set program_start = start_date where program_start is null` (적용은 컨트롤러가 승인 후); `types/database.types.ts`; `stores/userStore.ts`·`api/UserAPI.ts`(읽기/쓰기); `hooks/useChangeStartDate.ts` — 다시 시작·온보딩: program_start = 새 start_date, 주차 맞추기: program_start = min(program_start, 새 start_date), 한 주 더 하기: 그대로; `utils/reportDisplay.ts groupReportsByProgram` — 현재 회차 = report.start_date ≥ program_start(없으면 start_date) 인 것, 이전 회차는 program 경계로 묶기(이전 리포트들의 start_date를 회차 경계 없이 정렬해 묶되, 시작일 차이가 8주 이내로 이어지는 것은 한 묶음 — 규칙은 테스트로 고정); `utils/fastingHistory.ts` — 현재 회차의 모든 fasting_plan(start_date ≥ program_start)을 각자의 start_date로 날짜 계산해 합침, 결과는 day ≥ program_start; `components/records/FastingHistorySection.tsx` — 올해가 아닌 날짜는 "YYYY년 M월 D일 (요일)"; 지난 회차 단식 기록 보기(체중 '전체 기간 보기'와 같은 패턴, 회차별 접힘, 시안은 컨트롤러가 운영자 확인).
- 구버전 앱은 program_start를 모르므로 서버 함수(주간 리포트 등)는 바꾸지 않는다. program_start가 null이면 start_date로 대체.
- [ ] 테스트 먼저(회차 경계, 한 주 더 후 리포트·단식이 현재 회차로 유지, 주차 맞추기 앞당김, 연도 표시), 구현, Commit `✨ 회차 시작일로 리포트·단식 기록 이어 보기`
