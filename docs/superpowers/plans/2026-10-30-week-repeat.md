# 인바디 기록 + 주차 한 주 더 하기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 체중 기록에 골격근량·체지방량(선택)을 더하고, 2·3주차가 끝나 다음 주차로 넘어가는 날 시작 때와 비교해 "한 주 더 하기"를 제안한다.

**Architecture:** `weight_log`에 nullable 컬럼 2개(마이그레이션, 운영 반영은 운영자 승인 뒤). 판정은 순수 함수 `utils/weekRepeat.ts`(Vitest). 제안은 기존 주차 진입 팝업(`components/common/WeekCompletePopup.tsx`) 첫 단계 앞에 끼운다. "한 주 더"는 `UserAPI.updateStartDate(start_date + 7일)`로 시작일을 7일 미뤄 직전 주차 1일로 돌아가게 한다.

**Tech Stack:** Expo 53 / Supabase / React Query / zustand / Vitest.

## 근거 (박용우 레시피북, 이미지 번호 기준)
- p011 왼쪽: "3주 차까지 골격근이 유지되거나 늘어나면서 체지방이 잘 빠진다면 4주 차에는 주 3회를 해도 됩니다. 하지만 원하는 결과가 나오지 않았다면 무리하지 말고 4주 차에도 3주 차를 한 번 더 실행하면 됩니다."
- p018 왼쪽: 골격근이 충분히 회복되지 않았으면 "욕심내지 말고 3주 차를 한 주 더 하는 게 좋습니다."
- p023 왼쪽 (사례): 2주차에 근육이 회복되지 않아 2주차를 한 번 더 했다.
- 1주차 반복은 책에 없음 → 제안하지 않는다. 숫자 기준 없음 → 문구는 측정값 차이만 보여주고 의학적 단정 금지.

## Global Constraints
- 서버 변경은 마이그레이션 1개만: `weight_log.muscle_kg numeric(4,1) null check (muscle_kg between 5.0 and 100.0)`, `weight_log.fat_kg numeric(4,1) null check (fat_kg between 1.0 and 200.0)`. 파일 `supabase/migrations/20261030020000_weight_body_comp.sql`. **db push·함수 배포·운영 데이터 수정 금지** (운영자 승인 뒤 컨트롤러가 함).
- 구버전 앱 호환: 저장할 때 사용자가 입력한 필드만 보낸다. 체중만 고쳐도 같은 날 인바디 값이 지워지면 안 된다 (upsert payload에 undefined 필드를 넣지 않음). 인바디 칸을 비우고 저장하면 그 필드는 null로 지운다(사용자가 명시적으로 지운 경우만).
- 제안 대상: 2주차→3주차, 3주차→4주차로 넘어가는 순간(주차 진입 팝업이 뜰 때)만. 1주차·4주차 이후는 없음. 같은 전환에서 한 번만(로컬 저장, 키 = start_date + 전환 주차).
- 문구 해요체. 책 근거 문구는 상수 한 곳(`const/weekRepeat.ts`)에, 근거 쪽 주석.
- `npx tsc --noEmit` 0, 전체 vitest 통과(유료 연동 9개 제외 가능), 변경 파일 eslint·prettier.
- 다른 에이전트가 같은 워크트리에서 동시에 일한다: 자기 파일만 `git commit -m ... -- <paths>`로 커밋.

## 판정 규칙 (`utils/weekRepeat.ts`)
`weekRepeatAdvice({ logs, startDate, enteringWeek }): Advice`
- `enteringWeek`가 3이면 지난 주 = 2, 4면 = 3. 그 외 → `{ kind: 'none' }`.
- 기준값(baseline): 인바디 값(muscle_kg)이 있는 기록 중 날짜가 `[start_date - 7일, start_date + 2일]` 안에서 가장 늦은 것. 없으면 기간 안(start_date 이후) 첫 인바디 기록. 그래도 없으면 기준 없음.
- 최근값(latest): 지난 주(enteringWeek-1) 기간 안의 마지막 인바디 기록. 지난 주에 없으면 그 전 주까지 포함한 마지막 기록이되 기준값과 같은 날이면 없음 처리.
- 둘 다 없으면 `{ kind: 'noData', repeatWeek }` → 팝업은 "인바디 기록이 없어요" + 책 기준 설명 + [다음 주차로] [한 주 더 하기] 둘 다 같은 무게로.
- 골격근 차이 `muscleDiff = latest.muscle - baseline.muscle` (소수 한 자리). 체지방 차이는 둘 다 fat_kg가 있을 때만.
- 제안(`{ kind: 'suggestRepeat', repeatWeek, muscleDiff, fatDiff }`): `muscleDiff < 0`, 또는 repeatWeek = 3이고 fatDiff가 있고 `fatDiff >= 0` (p011: 골격근 유지·증가 + 체지방 감소일 때만 4주차).
- 그 외 `{ kind: 'onTrack', repeatWeek, muscleDiff, fatDiff }` → 축하 한 줄 후 기존 팝업으로.

## Review Focus
1. 체중만 수정 저장 시 같은 날 인바디 값 보존 → Task 1 테스트(payload 빌더).
2. "한 주 더" 후 주차 계산·할 일·단식 플랜이 직전 주차 1일로 정상 리셋, 팝업이 같은 전환에서 다시 뜨지 않음 → Task 2 테스트(`todayRevalidation`/store 키).
3. 시작일 이전 기록이 기준값으로 쓰이는 경계(start-7, start+2) → Task 2 테스트.
4. 인바디 한쪽만(골격근만) 입력한 경우 → 판정은 골격근만으로.
5. 이미 지난 전환(오래전 사용자, 5주차 이상)에는 아무것도 뜨지 않음.

---

### Task 1: 인바디 기록 입력·저장·표시
**Files:** Create `supabase/migrations/20261030020000_weight_body_comp.sql`; Modify `types/database.ts`(생성 타입에 두 컬럼 수동 추가, nullable), `api/WeightAPI.ts`(upsert가 `{ day, weight_kg, muscle_kg?, fat_kg? }` 받고 정의된 키만 보냄; list에서 Number 변환), Create `utils/bodyComp.ts`(+test) — `parseBodyCompInput(text, kind: 'muscle'|'fat'): number | null | 'invalid'`(빈칸 = null, 범위는 마이그레이션과 같음), `weightUpsertPayload(...)`; Modify `components/weight/WeightInputSheet.tsx`(체중 아래 "인바디 (선택)" 구분 + 골격근량·체지방량 kg 입력 2칸, 기존 값 미리 채움, 잘못된 값이면 기존 체중 오류 표시와 같은 방식), `hooks/useWeights.ts`, 기록 화면(`components/records/WeightSection.tsx`)의 기록 목록 행에 인바디 값이 있으면 "골격근 27.1 · 체지방 19.8" 작은 글씨.
- [ ] 테스트 먼저(빈칸 null, 범위 밖 invalid, 콤마 소수점, payload에 undefined 키 없음), 구현, 에뮬레이터 스크린샷(입력 시트) — 운영 계정에 저장하지 말 것(시트 열고 입력만 해서 캡처 후 취소), Commit `✨ 체중 기록에 골격근량·체지방량 추가`

### Task 2: 주차 넘어갈 때 한 주 더 하기 제안
**Files:** Create `const/weekRepeat.ts`(문구 + 근거 쪽 주석), `utils/weekRepeat.ts`(+test, 위 판정 규칙), Modify `stores/weekCompletePopupStore.ts`(persist에 `repeatAskedKeys: string[]` + 추가 함수), `components/common/WeekCompletePopup.tsx`(week가 3·4이고 아직 안 물었으면 첫 단계 앞에 '지난 주 돌아보기' 단계: 골격근·체지방 시작 대비 차이, 책 근거 한 줄, 버튼 [한 주 더 하기] / [N주차로 넘어가기]; noData면 측정 권유 + 두 버튼; onTrack이면 축하 한 줄 + [다음]), "한 주 더 하기" → `UserAPI.updateStartDate(addDaysToDay(start_date, 7))` 후 userStore 갱신, 팝업 닫기(직전 주차 1일 상태는 기존 `useKoreanToday` 재검증이 처리 — 주차 감소 시 팝업이 다시 열리지 않는지 `utils/programStart.ts todayRevalidation`으로 확인하고 필요하면 고침).
- 문구 예: 제안 "골격근이 시작할 때보다 0.6kg 적어요. 책에서는 골격근이 충분히 회복되지 않았으면 욕심내지 말고 3주차를 한 주 더 하라고 해요." / onTrack "골격근은 지키고 체지방은 1.2kg 줄었어요. 4주차로 넘어가도 좋아요." / noData "인바디를 재 봤다면 체중 기록에 골격근량·체지방량을 넣어 보세요. 골격근이 시작할 때만큼 회복되지 않았다면 한 주 더 해도 괜찮아요."
- `updateStartDate`가 성공 토스트를 띄우는지 확인하고, 이 흐름에서는 "3주차를 한 주 더 해요" 같은 맞는 문구가 되게.
- [ ] 테스트 먼저(규칙 전 분기, 경계 날짜, 같은 전환 한 번만, 1·5주차 none), 구현, 에뮬레이터 스크린샷(팝업 store에 week 4·가짜 logs로 미리보기 — 운영 계정 시작일 변경 금지), Commit `✨ 2·3주차 끝에 한 주 더 하기 제안`

### Task 3: 인바디 결과지 사진으로 자동 입력
운영자 결정(2026-10-30): 인바디 공개 API는 사업자용(LookinBody Web 파트너 계약)이고, 헬스 커넥트·건강 앱에는 골격근량 칸이 없어서 결과지 사진 인식으로 한다.
**Files:** Create `supabase/functions/read-inbody/`(food-check와 같은 구조: `index.ts`, `handler.ts`, deno.json), Create `api/InbodyAPI.ts`, Modify `components/weight/WeightInputSheet.tsx`(인바디 구분 옆 "결과지 사진으로 입력" 버튼 → 카메라/앨범(기존 expo-image-picker 사용처와 같은 방식) → 인식 중 표시 → 체중·골격근량·체지방량 칸을 채움, 사용자가 확인 후 저장. 자동 저장 금지).
- 함수: 로그인 사용자만(food-check의 인증 방식 그대로), 이미지는 저장하지 않음, Gemini 비전으로 JSON `{ weight_kg: number|null, muscle_kg: number|null, fat_kg: number|null, measured_on: 'yyyy-MM-dd'|null }` (응답 스키마 지정). 결과지가 아니거나 못 읽으면 전부 null. 서버에서 Task 1과 같은 범위(체중 20~300, 골격근 5~100, 체지방 1~200) 밖이면 null로. 남용 방지: food-check의 일일 한도·quota 방식이 있으면 그대로(없으면 사용자당 하루 10회, 기존 quota 테이블 재사용 가능한지 확인 후 판단, 새 테이블 금지). Gemini 호출은 `_shared/providerAlert.ts`의 알림 연결을 다른 Gemini 호출처럼 붙인다(테스트 스캔이 강제함).
- 앱: 인식 결과의 `measured_on`이 오늘이 아니면 "결과지 날짜 M/D" 안내 + 그 날짜로 저장할지 선택(기본: 결과지 날짜). 전부 null이면 "결과지에서 숫자를 찾지 못했어요. 직접 입력해 주세요".
- 체지방량은 kg 칸을 읽는다(체지방률 %와 헷갈리지 않게 프롬프트에 명시, 인바디 결과지 '체성분분석'의 체지방량 / '골격근·지방분석'의 골격근량).
- **함수 배포 금지** (운영자 승인 뒤 컨트롤러가 함). 에뮬레이터에서는 함수 대신 로컬 목 응답으로 시트 흐름만 캡처.
- [ ] 테스트 먼저(응답 정규화: 범위 밖 null, 문자열 숫자 변환, 날짜 형식 검증; 앱 쪽 결과→칸 채우기 매핑), 구현, `deno check`, Commit `✨ 인바디 결과지 사진으로 자동 입력`
