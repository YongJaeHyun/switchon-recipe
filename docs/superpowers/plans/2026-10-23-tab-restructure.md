# 하단 탭 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하단 탭을 오늘 / 레시피 / 기록 / 내 정보 4개로 나누고, 오늘 탭을 할 일 목록 하나로 줄인다.

**Architecture:** expo-router `app/(tabs)`에 탭 4개(`home`=오늘, `recipes`, `records`, `me`)를 둔다. 레시피 만들기·저장한 레시피·탐색 화면은 `recipes` 스택으로 옮기고, `/weight`·`/report`·`/profile`은 새 탭으로 넘겨주는 Redirect가 된다. 오늘 탭과 기록 > 단식의 판단 로직은 `utils/`의 순수 함수로 두고 Vitest로 고정한다.

**Tech Stack:** Expo 53 / expo-router(typedRoutes 켜짐) / React Query / NativeWind / Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-tab-restructure-design.md`

## Global Constraints

- 새 시각 스타일 없음: Pretendard, 초록 `colors.green[600]`, 주차 색 `getWeekColor`/`getWeekBGColor`/`getWeekColorHex`, 기존 `Text`·`RippleButton`·`CustomBottomSheet`·카드 스타일을 쓴다.
- 기능 로직(레시피 생성, 추천, 판정, 리포트 생성)은 바꾸지 않는다. 화면 위치·진입 경로만 바꾼다. 서버·DB 변경 없음.
- 매일 하는 동작(할 일 체크, 레시피 만들기 진입, 체중 기록, 단식 결과 응답)의 터치 수가 늘면 안 된다.
- 다음 링크가 그대로 열려야 한다: `/report/{startDate}/{week}`, `/weight`, `/report`, `/profile`, `/recipeDetail`, `/kakaolink`, `/recommend?meal=…`, `/foodCheck`, `/pass`.
- 패스 판매 중이 아니면 패스 요소를 숨기는 지금 규칙(`useBillingAvailable`/`passOnSale`) 유지.
- 오프라인에서도 오늘 탭이 열린다. 새 쿼리는 `failFastWhenOffline`으로 감싸고 실패해도 화면을 막지 않는다.
- 탭 바: `tabBarLabelPosition: 'below-icon'`과 커스텀 `RippleButton` 버튼 유지(태블릿·폴드 수정), 아이콘은 `MaterialIcons`.
- 문구는 해요체. 탭 이름 정확히: `오늘`, `레시피`, `기록`, `내 정보`.
- `npx tsc --noEmit`는 알려진 2개(app/(tabs)/explore/index.tsx·searchResult.tsx의 RecipeDB) 말고 새 오류 없음 — 파일이 옮겨지면 같은 2개 오류가 새 경로에서 나와도 된다. typedRoutes가 잘못된 href를 잡으므로 tsc 통과 = 경로 확인.

## Review Focus

1. **알림·딥링크 경로**: 푸시 `href` `/weight`, `/report/2026-10-21/1`, 그리고 `/profile`·`/report`가 새 탭의 해당 칸으로 열린다 → Task 1 경로 스캔 테스트 + Task 7 에뮬레이터 확인.
2. **유지기(5주차~)·1주차(단식 없음)**: 오늘 탭에 단식 줄·단식 요일 줄이 엉뚱하게 나오지 않는다 → Task 6 `todayExtraRows` 테스트.
3. **시작일 변경 직후**: 기록 > 단식 목록이 새 프로그램(새 시작일 이후)만 보여준다 → Task 5 `fastingHistory` 테스트.
4. **오프라인**: 오늘·레시피 탭이 네트워크 없이 열린다(탐색 데이터 미리 안 불러옴) → Task 2·6 구현 규칙 + Task 7 확인.
5. **태블릿·폴드 4탭 라벨**: `내 정보` 라벨이 잘리지 않는다 → Task 7 `wm size 2208x1840` 확인.

---

### Task 1: 탭 4개 뼈대와 경로 옮기기

**Files:**
- Modify: `app/(tabs)/_layout.tsx` (탭: `index`(숨김), `home` 제목 `오늘` 아이콘 `today`, `recipes` 제목 `레시피` 아이콘 `restaurant-menu`, `records` 제목 `기록` 아이콘 `insights`, `me` 제목 `내 정보` 아이콘 `person`; 탐색 NEW 배지 삭제)
- Create: `app/(tabs)/recipes/_layout.tsx` (Stack: `index` 헤더 없음, `savedRecipes` "저장한 레시피", `recipeCreation/zero` "무탄수 레시피 제작", `recipeCreation/low` "저탄수 레시피 제작", `explore` "다른 사람들의 레시피", `search`, `searchResult` — 제목·옵션은 지금 home/explore 스택 값 복사)
- Move: `app/(tabs)/home/recipeCreation/{zero,low}.tsx`, `app/(tabs)/home/savedRecipes.tsx` → `app/(tabs)/recipes/…`; `app/(tabs)/explore/index.tsx` → `app/(tabs)/recipes/explore.tsx`, `explore/search.tsx`·`searchResult.tsx` → `recipes/search.tsx`·`recipes/searchResult.tsx`; `app/(tabs)/explore/` 삭제
- Create: `app/(tabs)/recipes/index.tsx` (임시: 저장한 레시피·만들기 링크만 있는 자리 표시 — Task 2에서 채움), `app/(tabs)/records/index.tsx` (임시 자리), `app/(tabs)/me/index.tsx` (임시 자리)
- Modify: `app/(tabs)/home/_layout.tsx` (index만 남김), 옛 경로를 쓰는 모든 곳(`grep -rn "/(tabs)/home/recipeCreation\|/(tabs)/home/savedRecipes\|/(tabs)/explore"`: `CreationLoadingOverlay`, `Category`, `RecentKeywords`, `PopularCategories`, `ListEmptyText`, `FastingCard`, `SavedRecipes`, `RecentRecipes`, `utils/dietGuide.ts`의 `getTodoAction` href 등)
- Test: `const/routes.test.ts`

**Interfaces:**
- Produces: 경로 `/(tabs)/recipes/recipeCreation/zero|low`, `/(tabs)/recipes/savedRecipes`, `/(tabs)/recipes/explore`, `/(tabs)/recipes/search`, `/(tabs)/recipes/searchResult`, `/(tabs)/records`, `/(tabs)/me`.

- [ ] **Step 1: 실패 테스트** `const/routes.test.ts` — `app/`, `components/`, `hooks/`, `utils/`, `const/`의 `.ts/.tsx`(테스트 파일 제외)를 읽어 다음 문자열이 0번 나와야 한다: `'/(tabs)/home/recipeCreation'`, `'/(tabs)/home/savedRecipes'`, `'/(tabs)/explore'`. (node `fs`로 재귀 탐색)
- [ ] **Step 2:** `npx vitest run const/routes.test.ts` → FAIL (옛 경로 발견 목록 출력)
- [ ] **Step 3:** 위 Files대로 옮기고 참조를 바꾼다. `git mv`로 옮겨 이력을 남긴다.
- [ ] **Step 4:** `npx vitest run const/routes.test.ts` PASS, `npx tsc --noEmit`(typedRoutes 타입은 Metro가 `.expo/types`에 다시 만든다 — 안 바뀌면 `npx expo start`를 잠깐 띄워 생성) 새 오류 없음, 전체 `npx vitest run` PASS
- [ ] **Step 5: Commit** `♻️ 하단 탭을 오늘·레시피·기록·내 정보로 나누고 레시피 화면 경로 이동`

### Task 2: 레시피 탭 화면

**Files:**
- Modify: `app/(tabs)/recipes/index.tsx`
- Modify: `components/home/PremiumFeatureCards.tsx` → 리포트 카드를 빼고 맞춤 추천·편의점 판정 두 칸만 남긴다(리포트 진입은 Task 4가 기록 탭에 둔다). 이름은 `components/recipes/RecipeToolCards.tsx`로 옮긴다.
- Move: `components/home/{RecipeCreation,SavedRecipes,RecentRecipes,RecipeCard}.tsx` → `components/recipes/`
- Create: `components/recipes/ExploreEntry.tsx`

**Interfaces:**
- Consumes: Task 1 경로.

- [ ] **Step 1:** 레시피 탭 내용(위→아래, 스펙 §레시피 탭 그대로): 검색창 모양 버튼(누르면 `/(tabs)/recipes/search`), `RecipeCreation` 무탄수·저탄수 두 카드, `RecipeToolCards`(맞춤 추천·편의점 판정, 지금 잠금·패스 규칙 그대로), `SavedRecipes`(모두보기 → `/(tabs)/recipes/savedRecipes`), `RecentRecipes`(모두보기 없음, "저장하지 않은 레시피는 한 달이 지나면 자동으로 삭제돼요." 유지), `ExploreEntry` 한 줄 카드 "다른 사람들의 레시피 둘러보기"(누르면 `/(tabs)/recipes/explore`). 저장·최근 레시피 쿼리와 당겨서 새로고침은 지금 홈 `index.tsx`의 것을 옮긴다. 탐색 데이터는 이 화면에서 불러오지 않는다.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint` 변경 파일, `npx vitest run` PASS
- [ ] **Step 3: Commit** `✨ 레시피 탭: 만들기·추천·판정·저장/최근 레시피·탐색 진입`

### Task 3: 내 정보 탭

**Files:**
- Move: `app/profile.tsx` 내용 → `app/(tabs)/me/index.tsx`; `app/profile.tsx`는 `<Redirect href="/(tabs)/me" />`만 남긴다(`app/_layout.tsx`의 profile Stack.Screen 옵션은 유지하거나 정리)
- Create: `components/me/WeightReminderToggle.tsx`, `components/me/StartDateRow.tsx`
- Modify: `components/home/HomeHeader.tsx` (프로필 사진 `Link` → `/(tabs)/me`)
- Move: `app/profile.tsx`의 `Week` 컴포넌트와 4주 리포트 렌더(`todoRateStatistics` 쿼리 포함) → `components/records/FourWeekReport.tsx` (Task 4가 씀). 내 정보에서는 4주 리포트·주간 리포트 진입을 뺀다.

**Interfaces:**
- Produces: `FourWeekReport(): JSX.Element` — props 없음, 지금 프로필과 같은 쿼리·표시.

- [ ] **Step 1:** 내 정보 화면(위→아래): 사용자 이름·사진(지금 그대로), 패스 카드(지금 프로필 패스 영역, 판매 중일 때만), 목록 — `StartDateRow`("시작일" + `M월 D일` + "바꾸기", 누르면 기존 `StartDateBottomSheet`를 연다; 시트는 이 화면에도 하나 둔다), `WeightReminderToggle`("체중 기록 알림" 스위치, `UserSettingAPI`로 `weight_reminder` 저장, 켤 때 `registerForPushNotificationsAsync(CHANNELS.REPORT)` 후 저장, 꺼질 때 권한 요청 없음, 저장 실패 시 기존 토스트 패턴으로 되돌림), 공지사항(기존 `AllNoticesModal` 열기), 문의하기, 로그아웃, 탈퇴 — 나머지는 지금 프로필과 같은 순서.
- [ ] **Step 2:** `npx tsc --noEmit`, eslint, `npx vitest run` PASS
- [ ] **Step 3: Commit** `✨ 내 정보 탭: 패스·시작일·체중 알림·공지·문의·계정`

### Task 4: 기록 탭 — 체중·리포트 칸

**Files:**
- Create: `app/(tabs)/records/index.tsx` (위쪽 3칸 전환 `체중 / 단식 / 리포트`, 쿼리 `view=weight|fasting|report`, 기본 `weight`)
- Create: `components/records/RecordsSegment.tsx`, `components/records/WeightSection.tsx`(지금 `app/weight.tsx` 본문), `components/records/ReportSection.tsx`(맨 위 `FourWeekReport`, 그 아래 지금 `app/report/index.tsx` 목록·미리보기 카드)
- Modify: `app/weight.tsx` → `<Redirect href={{ pathname: '/(tabs)/records', params: { view: 'weight' } }} />`; `app/report/index.tsx` → 같은 방식 `view: 'report'`. `app/report/[startDate]/[week].tsx` 상세는 그대로.
- Create: `utils/recordsView.ts` + `utils/recordsView.test.ts`

**Interfaces:**
- Consumes: Task 3 `FourWeekReport`.
- Produces: `export type RecordsView = 'weight' | 'fasting' | 'report'; export function parseRecordsView(v: unknown): RecordsView` (모르는 값·배열·undefined → `'weight'`). 단식 칸은 Task 5가 `FastingHistorySection`으로 채운다(이 태스크에서는 빈 자리).

- [ ] **Step 1: 실패 테스트** `parseRecordsView('report')==='report'`, `('fasting')==='fasting'`, `(undefined)==='weight'`, `('x')==='weight'`, `(['report'])==='weight'`
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현(화면 포함; 리포트 목록 진입 시 `registerChannelIfPermitted(CHANNELS.REPORT)` 등 지금 `/report` 동작 유지) → **Step 4:** 테스트·tsc·eslint·전체 vitest PASS
- [ ] **Step 5: Commit** `✨ 기록 탭: 체중·리포트 칸, /weight·/report는 기록 탭으로`

### Task 5: 기록 탭 — 단식 칸

**Files:**
- Create: `utils/fastingHistory.ts` + `utils/fastingHistory.test.ts`
- Modify: `api/FastingPlanAPI.ts` (`selectAll(startDate: string): Promise<{ week_index: number; days: number[]; start_time: string | null }[]>`), `api/FastingResultAPI.ts` (`selectSince(fromDay: string): Promise<{ day: string; result: FastingResult }[]>`)
- Create: `hooks/useFastingHistory.ts`, `components/records/FastingHistorySection.tsx`
- Modify: `const/queryKey.ts` (끝에 `fastingHistory` 추가), `hooks/useFastingResult.ts`(저장 성공 시 `fastingHistory` 무효화)

**Interfaces:**
- Produces:
```ts
export interface FastingHistoryItem { day: string; weekIndex: number; result: 'success' | 'broken' | null; }
export function fastingHistory(input: {
  startDate: string;                                   // 현재 시작일 (yyyy-MM-dd)
  plans: { week_index: number; days: number[]; start_time: string | null }[];
  results: { day: string; result: 'success' | 'broken' }[];
  now: Date;
}): FastingHistoryItem[];                              // 최근 날짜가 먼저
```
- 규칙: 계획일 = 각 plan 주차 범위(`startDate + 7*(week_index-1)` ~ +6일) 안에서 요일(`0`=일)이 `days`에 든 날 중 **단식이 이미 시작된 날**(시작 시각 = 그날 KST 자정 + `FASTING_START_HOUR[start_time]`, `start_time`이 없으면 그날 자정) ∪ 결과가 있는 날. `startDate` 이전 날짜는 빼고, 같은 날은 하나로 합친다. `weekIndex`는 `startDate` 기준으로 계산.

- [ ] **Step 1: 실패 테스트** (`startDate: '2026-10-15'`)
  - 2주차 plan `{week_index:2, days:[4], start_time:'저녁 식후'}`, now `2026-10-23T09:00+09:00` → `[{day:'2026-10-22', weekIndex:2, result:null}]`
  - 같은 조건 + results `[{day:'2026-10-22', result:'success'}]` → result `'success'`
  - now `2026-10-22T18:00+09:00`(목 19시 전) → `[]` (아직 시작 안 함)
  - 계획에서 빠진 날의 결과 `[{day:'2026-10-19', result:'broken'}]` → 목록에 `2026-10-19`(2주차) 포함, 최근순 정렬
  - 결과 `day:'2026-10-10'`(시작일 이전) → 빠짐
  - plans·results 비어 있음 → `[]`
- [ ] **Step 2:** FAIL → **Step 3:** 구현. 화면: 주차별로 묶지 않고 최근순 목록, 각 줄 `10월 22일 (목) · 2주차` + 결과 글자(성공 / 중간에 먹음 / 기록 안 함). 줄을 누르면 작은 시트(`CustomBottomSheet`)에 [성공했어요] [중간에 먹었어요] — 기존 `FastingResultAPI.upsert`로 저장, 기간 제한 없음. 목록 맨 아래 한 줄 안내 "단식 기록은 6.0.0 업데이트 이후부터 남아요". 비어 있으면 "아직 단식 기록이 없어요" + 단식 요일 설정 안내. 쿼리는 `failFastWhenOffline`.
- [ ] **Step 4:** 테스트·tsc·eslint·전체 vitest PASS
- [ ] **Step 5: Commit** `✨ 기록 탭 단식 칸: 지난 단식 결과 보기·고치기`

### Task 6: 오늘 탭 — 할 일 목록 하나로

**Files:**
- Modify: `app/(tabs)/home/index.tsx` (남는 것: `HomeHeader`, `LatestNotice`, `TodayChecklist`, `StartDateBottomSheet`, `WeekCompletePopup` 관련 그대로; 빼는 것: `PassBanner`, `RecipeCreation` 카드, `WeightCard`, `PremiumFeatureCards`/`RecipeToolCards`, `SavedRecipes`, `RecentRecipes`와 그 쿼리)
- Create: `components/home/TodayChecklist.tsx` (지금 `WeekGuide`를 대체), `components/home/FastingProgressLine.tsx`, `components/home/FastingResultRow.tsx`, `components/home/WeightRow.tsx`, `components/home/FastingDayLine.tsx`
- Delete(사용처 없어지면): `components/home/WeekGuide.tsx`, `components/home/FastingCard.tsx`, `components/home/WeightCard.tsx`, `components/home/PassBanner.tsx`(내 정보에서 안 쓰면)
- Create: `utils/todayRows.ts` + `utils/todayRows.test.ts`

**Interfaces:**
- Produces:
```ts
export interface TodayExtraRows {
  fastingProgress: boolean;   // 단식 진행 중 → 목록 위 남은 시간 줄
  fastingResultDay: string | null; // 결과 질문 줄 (답했어도 창 안이면 결과+바꾸기로 표시)
  weight: true;               // 체중 줄은 항상
  fastingDayLine: 'set' | 'unset' | null; // 목록 아래 단식 요일 줄: 설정됨 / 미설정 안내 / 단식 없는 주차
}
export function todayExtraRows(input: {
  week: number; now: Date; fastingDays: number[]; startTime: FastingTime | null | undefined;
  weekContext?: FastingWeekContext;
}): TodayExtraRows;
```
  내부에서 기존 `getFastingStatus`, `fastingResultWindow`를 쓴다(로직 새로 만들지 않음). 단식이 있는 주차 = 지금 단식 카드/요일 설정이 나오는 주차 규칙 그대로(2~4주차 및 유지기에 지금 보이는 규칙을 코드에서 확인해 따른다).

- [ ] **Step 1: 실패 테스트**
  - 1주차 → `fastingProgress:false, fastingResultDay:null, fastingDayLine:null`
  - 2주차, 목(4) 저녁 식후, now 금 `2026-10-23T09:00+09:00` → `fastingProgress:true`(단식 중), `fastingResultDay:null`
  - 같은 설정, now 금 `2026-10-23T19:30+09:00` → `fastingProgress:false`, `fastingResultDay:'2026-10-22'`
  - 2주차, 단식 요일 미설정 → `fastingDayLine:'unset'`; 설정됨 → `'set'`
  - 유지기(5주차) 설정 없음 → 지금 유지기 화면에서 단식 카드가 보이는 규칙과 같은 값(코드 확인 후 단언 확정)
- [ ] **Step 2:** FAIL → **Step 3:** 구현. 화면(위→아래, 스펙 §오늘 탭): 헤더(인사말, `N주차` + 톱니바퀴, 7일 진행; 프로필 사진 → `/(tabs)/me`), 공지 한 줄, `FastingProgressLine`(진행 중일 때, "단식 중 · N시간 N분 남았어요" + 막대 + 끝나는 시각), 카드 하나에 제목 `오늘 할 일` + 오른쪽에 식단 완료율 %(지금 `AnimatedNumbers` 그대로, 크기만 줄임; 단식·체중 줄은 계산에 넣지 않음) → 식단 할 일 줄들(기존 `Todo` 그대로, 레시피 만들기·팁 버튼 포함) → `FastingResultRow`("어제 단식 어땠나요?"/요일 기준 문구 + [성공] [중간에 먹음], 답하면 "✅ 성공으로 기록했어요 · 바꾸기") → `WeightRow`(오늘 기록 없으면 "오늘 체중 기록" [기록하기], 있으면 "오늘 69.4kg" [수정]; 기존 `WeightInputSheet`와 알림 질문 흐름 그대로). 카드 아래 `FastingDayLine`("단식 요일: 목 저녁 식후 · 바꾸기" 또는 "이번 주 단식 요일을 정해주세요 · 설정하기" → 기존 `FastingDayBottomSheet`). 유지기: 식단 할 일 자리에 지금 유지기 안내. 100%일 때 트로피 아이콘은 유지. `useTodos({ syncTodoDaily: true })`는 이 컴포넌트가 켠다(지금 `WeekGuide`에서 옮김). 팁 시트(`TipBottomSheet`) 유지.
- [ ] **Step 4:** 테스트·tsc·eslint·전체 vitest PASS
- [ ] **Step 5: Commit** `✨ 오늘 탭: 식단·단식 결과·체중을 한 목록으로`

### Task 7: 정리와 기기 확인

**Files:**
- Modify: 남은 미사용 import·컴포넌트 삭제, `components/home/LatestNotice.tsx`의 v6.0.0 공지 문구(있으면) 탭 개편 내용 한 줄 추가
- Test: 없음(기기 확인)

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint app components hooks utils api const` → 새 오류 없음
- [ ] **Step 2 (에뮬레이터, Metro는 premium 워크트리에서 실행 중):** 휴대폰 크기에서 4탭 이동; 오늘 탭 체크·레시피 만들기·체중 기록·(2주차로 시작일을 잠깐 바꿔) 단식 결과 줄; 레시피 탭 각 진입; 기록 탭 세 칸·단식 결과 고치기; 내 정보 시작일·체중 알림 토글; `adb shell am start -a android.intent.action.VIEW -d "exp+switchon-recipe://weight"`, `…://report`, `…://profile`, `…://report/2026-10-21/1`이 각각 기록(체중)·기록(리포트)·내 정보·리포트 상세로 열림; `wm size 2208x1840`에서 4탭 라벨; 오프라인(비행기 모드)에서 오늘·레시피 탭 열림. 시작일·테스트 기록은 원래대로 되돌린다.
- [ ] **Step 3: Commit** `🧹 탭 개편 정리`
