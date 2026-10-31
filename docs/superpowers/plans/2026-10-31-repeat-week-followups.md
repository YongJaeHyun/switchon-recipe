# 한 주 더 하기 후속: 리포트 제목, 패스 연장, 시작일 작은 문제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 한 주 더 하기·주차 맞추기 뒤에도 리포트 제목이 실제로 지낸 주차로 붙고, 패스가 회차 전체를 책임지도록 한 주 더 하기 때 7일 연장하며, 시작일 점검(.superpowers/sdd/start-date-audit.md)의 작은 문제를 모두 고친다.

**Spec:** 운영자 결정(2026-10-31, 대화):
- "한 주 더 하기 하면 같은 7일에 대해 더 만들어지는 게 맞아. 제목이 1주차로 잘못 붙는 문제를 수정하면 될 것 같아" → 7e354af의 '겹치면 건너뛰기'는 되돌리고, 리포트는 만들되 제목(주차 표시)을 실제로 지낸 주차로.
- "패스도 한 주 더 늘려주는 게 좋을 것 같아. 패스는 한 회차 전체를 책임져주는 서비스" → 한 주 더 하기 성공 시 활성 패스 7일 연장.
- "이외의 작은 문제들도 전부 고쳐줘" → 감사 보고서 Minor 전부.

## Global Constraints
- 서버 변경(마이그레이션·함수)은 작성만, 적용·배포는 컨트롤러가 운영자 승인 후.
- 5.x·6.0.0(빌드 69) 앱 호환: 새 칸은 nullable, 옛 앱이 몰라도 동작.
- UI 문구·화면이 바뀌면 Skill 도구로 `frontend-design:frontend-design` 먼저.
- TDD, 전체 vitest(유료 테스트는 RUN_PAID_TESTS로 막힘), `npx tsc --noEmit`, 바뀐 함수 `deno check`, eslint·prettier.

---

### Task 1: 리포트 제목을 실제로 지낸 주차로
- 7e354af의 겹침 건너뛰기를 되돌리고(리포트는 생성), 대신 `weekly_report.display_week integer null`(마이그레이션) — 새 리포트 기간이 기존 리포트와 4일 이상 겹치면 그 리포트의 표시 주차(`display_week ?? week_index`)를 이어받고, 아니면 회차 안에서 지낸 주차(한 주 더 반복이면 같은 숫자)를 쓴다. 규칙은 테스트로 고정. 같은 표시 주차가 회차 안에 두 번이면 앱에서 "N주차 · 한 번 더"로 표시.
- 푸시 문구, Gemini 프롬프트의 주차 문맥, 앱 리포트 목록·상세 제목이 표시 주차를 쓴다(앱은 `display_week ?? week_index`).
- 감사 #3(시작일 변경이 08:00 전이면 지난 주 리포트 누락)도 이 규칙으로 해결되는지 확인하고, 다시 시작 직전 주가 빠지는 경우는 크론이 이전 회차의 마지막 완료 주를 한 번 더 확인해 만들도록(최소 변경) — 불가하면 이유를 기록.

### Task 2: 시작일 점검의 작은 문제 전부
- `.superpowers/sdd/start-date-audit.md` Minor 항목 중 Task 1·이미 고친 것(#1,#2,#7)을 뺀 전부(#4~#6, #8~#16 — 보고서 번호 기준). 항목별 커밋 가능, 각 테스트.

### Task 3: 한 주 더 하기 때 패스 7일 연장
- 서버: 마이그레이션 `pass_extension(uid, new_start_date date, extended_at, primary key(uid,new_start_date))` + security definer RPC `extend_pass_for_week_repeat(p_new_start date)`: 호출자 활성 패스가 있고, `user.start_date = p_new_start`이며 program_start는 그대로이고(=한 주 더), 같은 new_start로 연장한 적 없고, 한 회차당 연장 최대 4번일 때만 `user_pass.pass_expires_at += 7 days`. anon/authenticated는 RPC 실행만, 테이블 직접 접근 불가.
- 앱: `useWeekRepeat` 성공 후 호출(실패해도 한 주 더 하기는 성공), 패스 화면 JourneyHero·남은 기간이 새 만료일 반영, 한 주 더 확인 문구에 "패스도 한 주 늘어나요"(패스 사용자만).
