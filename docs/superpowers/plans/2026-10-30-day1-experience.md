# 1주차 첫날 경험 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 1주차 첫 3일 이탈을 줄이기 위해 시작 전 준비, 일별 안내, 끼니 알림, 완주 축하·다음 날 리마인드를 넣는다.

**Architecture:** 서버 변경 없음. 순수 로직(시작 전 판정, 알림 시각 계산, 안내 문구 선택)을 `utils/`에 두고 Vitest로 고정한다. 로컬 알림은 기존 단식 알림처럼 `data.kind`로 구분해 예약·취소한다(`utils/notifications.ts`). 로컬 상태(체크리스트, 닫음, 축하 본 날)는 AsyncStorage(zustand persist) 한 스토어.

**Tech Stack:** Expo 53 / expo-notifications / zustand persist / Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-day1-experience-design.md`

## Global Constraints
- 서버·DB·엣지 함수 변경 금지. 새 네이티브 의존성 금지.
- 알림은 1주차(끼니)·1주차~2주차 1일(아침 리마인드)만. 하루 최대 5개. 권한 없으면 조용히 건너뜀(권한 요청은 온보딩·내 정보 켜기에서만).
- 로컬 알림 `data.kind`: 끼니 `'meal'`, 아침 리마인드 `'daily'`. 단식 `'fasting'` 알림을 절대 건드리지 않는다.
- 끼니 기본 시각(분): 아침 480, 점심 750, 오후간식 960, 저녁 1110. 아침 리마인드 540(09:00 KST).
- 문구 해요체. 의학적 단정 금지. 1주차 안내 문구는 `const/week1Guide.ts` 한 곳.
- `npx tsc --noEmit` 0, 전체 vitest 통과(유료 연동 테스트 9개 제외 가능), 변경 파일 eslint·prettier.

## Review Focus
1. 시작일이 미래인 사용자가 할 일·단식·주차 팝업·리포트 화면에서 오류·음수 주차를 보지 않는다 → Task 1 테스트.
2. 끼니 알림: 체크한 끼니 취소, 체크 해제 시 재예약, 1주차 밖에서는 예약 없음, 지난 시각 건너뜀, 단식 알림은 그대로 → Task 3 테스트.
3. KST 날짜 경계(자정 직전·직후, 기기 시간대가 KST 아님) → Task 3·4 테스트.
4. 아침 리마인드가 그날 앱을 연 사람에게 가지 않음(앱을 열면 오늘 것 취소, 내일 것 예약) → Task 4 테스트.
5. 축하 시트는 하루 한 번, 100%가 됐다가 체크를 풀고 다시 100%가 돼도 한 번 → Task 4 테스트.

---

### Task 1: 시작 전 상태 + 내일부터 시작 + 준비 체크리스트
**Files:** Create `utils/programStart.ts`(+test) — `daysUntilStart(startDate, todayKst): number`(0 = 오늘 시작, 양수 = 시작 전), `isBeforeStart`; Modify `utils/date.ts getWeekAndDay` 호출부 중 시작 전이면 깨지는 곳(할 일 `hooks/useTodos.ts`, 단식 `hooks/useFasting*`, 주차 팝업 `hooks/useKoreanToday.ts`, 기록·리포트 화면)을 안전하게; Create `stores/firstWeekStore.ts`(zustand persist: prepChecks, guideDismissedDay, celebratedDays); Create `components/home/BeforeStartCard.tsx`; Modify `components/home/TodayChecklist.tsx`(시작 전이면 할 일 대신 BeforeStartCard), `app/(auth)/onboard.tsx`(처음 시작하는 사람: "내일부터 시작 (추천)" 첫 선택지, "오늘부터" 둘째, 안내 문구).
- 준비 항목 4개: 쉐이크 준비 / 1~3일차 규칙 읽기(팁 시트) / 4일차 저탄수식 재료 장보기(1주차 재료 화면) / 끼니 알림 켜기(Task 3 전엔 '내 정보'로 이동하는 항목으로 두고 Task 3에서 연결).
- [ ] 테스트 먼저(daysUntilStart 경계, 시작 전 주차 계산 호출부), 구현, 에뮬레이터 확인(시작일을 내일로 바꾸는 건 운영 계정이라 하지 말 것 — 로컬에서 store/props로 미리보기), Commit `✨ 시작 전 준비 화면과 내일부터 시작 권장`

### Task 2: 1주차 일별 안내 카드
**Files:** Create `const/week1Guide.ts`(day 1~7: `{ line, tip: Tip, tomorrow }`), `utils/week1Guide.ts`(+test) — `week1GuideFor(week, day)`; Create `components/home/Week1GuideCard.tsx`; Modify `TodayChecklist.tsx`(1주차면 할 일 카드 위, 닫으면 그날 숨김).
- 문구 근거: 박용우 레시피북 페이지 이미지 `/Users/hyun/.claude/jobs/910c614f/tmp/pdfx/pages/`와 기존 `supabase/functions/_shared/weeklyReport.ts WEEK_BODY_CONTEXT[1]`. 근거 없는 수치·의학 단정 금지. 각 날짜 문구 옆에 근거 페이지 주석.
- [ ] 테스트 먼저, 구현, 에뮬레이터 스크린샷, Commit `✨ 1주차 일별 안내 카드`

### Task 3: 끼니 시간 알림
**Files:** Create `utils/mealAlarms.ts`(+test) — `mealAlarms({ startDate, now, times, checkedToday, todos }): { date, body, meal }[]`(1주차 남은 날의 끼니, 오늘 체크한 끼니·지난 시각 제외, 그날 할 일 문구로 본문); Modify `utils/notifications.ts`(meal 예약·취소 `syncMealAlarms`, `data.kind='meal'`, 채널 `CHANNELS.MEAL`), `const/channels.ts`; Create `stores/mealAlarmStore.ts` 또는 `firstWeekStore`에 설정(on, times); Create `components/me/MealAlarmSetting.tsx`(켜기/끄기 + 시각 4개, 기존 `WheelPicker`/`TimeWheel` 재사용, 30분 단위); Modify `app/(tabs)/me/index.tsx`, `app/(auth)/onboard.tsx`(마지막 단계 "끼니 시간에 알려드릴까요?" — 예면 `prepareLocalNotifications` 권한 요청, 거부면 꺼짐), `hooks/useTodos.ts`(체크 변경 때 sync), 앱 열 때 sync(단식 sync와 같은 자리).
- 끼니 시각 ↔ 단식 연결(스펙 '추가'): `utils/mealTimes.ts` — `DEFAULT_MEAL_MINUTES {breakfast 480, lunch 750, snack 960, dinner 1110}`, `afterMealMinutes(times) = times + 30`; `QUICK_TIMES`(fastingSchedule 앱 쪽 사용처)·새 요일 기본값·`utils/fastingTodos.ts` 끼니 마치는 시각이 사용자 끼니 시각에서 나오게. 서버 복사본·legacyLabel은 그대로.
- [ ] 테스트 먼저(경계·KST·체크 취소·1주차 밖 없음·단식 알림 보존, 식후 = 끼니+30 기본값 08:30/13:00/19:00), 구현, Commit `✨ 1주차 끼니 시간 알림`

### Task 4: 완주 축하 + 다음 날 아침 리마인드
**Files:** Create `utils/dailyReminder.ts`(+test) — `nextMorningReminder({ startDate, now }): { date, body } | null`(내일이 1주차 2~7일 또는 2주차 1일이면 내일 09:00 KST, 아니면 null), `shouldCelebrate({ week, day, completedRate, celebratedDays, today })`; Modify `utils/notifications.ts`(`data.kind='daily'` 예약·취소: 앱 열 때 오늘 것 취소 + 내일 것 예약), Create `components/home/DayCompleteSheet.tsx`(lottie 재사용, "N일차 완주!" + `week1Guide` 내일 예고), Modify `TodayChecklist.tsx`.
- [ ] 테스트 먼저, 구현, 에뮬레이터 스크린샷, Commit `✨ 1주차 완주 축하와 다음 날 아침 알림`
