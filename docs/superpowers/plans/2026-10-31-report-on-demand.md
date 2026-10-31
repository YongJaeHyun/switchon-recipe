# 리포트 직접 만들기·다시 만들기 + 리포트 전날 기록 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Spec (운영자 결정 2026-10-31):**
- 기록이 있는 주는 지금처럼 08:00 자동 생성·알림. 기록이 없는 주는 빈 리포트를 만들지 않고, 목록에 "기록이 없어서 아직 리포트가 없어요" + [지금 만들기]. 기록이 여전히 없으면 버튼 비활성 + "그 주 체중이나 할 일을 기록하면 만들 수 있어요".
- 이미 만든 리포트도 생성 뒤 그 주 기록이 추가됐을 때만 [다시 만들기], 리포트당 하루 1번(KST).
- 버튼은 패스 사용자만. 무료 1주차 리포트는 지금처럼 평생 1번.
- 리포트 만들기 전날 알림: 리포트가 나오기 전날 저녁 "내일 아침 N주차 리포트가 나와요. 오늘 체중과 할 일을 기록해 두세요" 류 푸시로 미리 기록하게 한다.

## Global Constraints
- 서버 변경은 작성만(적용·배포는 컨트롤러가 운영자 승인 후). 옛 앱(5.x, 6.0.0 빌드 69) 호환.
- AI 비용: 직접 만들기·다시 만들기는 패스 사용자만, 리포트(주)당 하루 1번, 서버가 최종 판단(앱 표시는 참고). 기록 없는 주는 Gemini 호출 없음.
- 같은 규칙 재사용: `_shared/weeklyReportGenerate.ts`(표시 주차, MAX_REPORT_WEEK=5, 현재 회차, alignedAheadOver).
- UI는 Skill `frontend-design:frontend-design` 먼저. 문구 해요체.
- TDD, 전체 vitest, tsc, deno check, eslint·prettier.

### Task 1: 리포트 직접 만들기·다시 만들기
- 서버: 새 함수(예 `generate-my-report`, 로그인 사용자) — 입력 (start_date, week_index) 키, 사용자 본인·현재 회차·완료된 주·표시 주차 ≤5·패스 확인 → 기록 없으면 400 `no_records`(Gemini 없음) → 없으면 생성, 있으면(다시 만들기) 마지막 생성 이후 그 주 기록이 바뀌었고(weight_log.updated_at / todo_daily / fasting_result 등 기록 시각 > report.created_at 또는 updated_at) 오늘(KST) 다시 만든 적 없을 때만 갱신. 하루 1번은 `weekly_report.regenerated_at`(마이그레이션) 등으로 서버에서. 푸시 없음(사용자가 화면에 있음).
- 자동 생성(크론·구매 보충)에서 기록 없는 주는 저장하지 않게(지금 저장하는 경로가 있으면) 맞춘다.
- 앱: 기록 탭 리포트 목록에 현재 회차의 완료된 주 중 리포트 없는 주를 빈 칸으로 표시(+ [지금 만들기] 또는 비활성 안내), 리포트 상세에 조건이 맞으면 [다시 만들기]. 진행 중 표시, 실패 문구.

### Task 2: 리포트 전날 기록 알림
- 서버: 새 크론 함수(예 `report-eve-reminder`, 매일 20:00 KST) — 대상: 내일(KST)이 새 주 1일이 되어 내일 08:00에 표시 주차 1~5 리포트가 만들어질 사용자 중 패스 사용자 또는 무료 1주차 리포트 대상(free_report_at null, 표시 주차 1). 오늘 체중 기록이 이미 있으면 보내지 않음. 문구: 제목 "내일 아침 N주차 리포트가 나와요", 본문 "오늘 체중과 할 일을 기록해 두면 더 정확하게 정리해 드려요". 링크: 오늘 탭(체중 기록 시트 열기 가능하면). REPORT 채널. 크론 등록 마이그레이션(기존 weight-reminder cron 등록 방식 그대로). 중복 방지(하루 1번).
- 앱: 알림 탭 → 오늘 탭(기존 notificationHref 매핑에 추가).
