# 패스 유도: 써 보게 한 뒤 팔기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 패스 기능을 결제 전에 직접 써 보게 하고, 필요한 순간에 패스를 안내한다.

**Spec (운영자 결정 2026-10-31 "전부 진행해줘", 근거: 2026-10-30 패스 전환 분석 — 2주차까지 오는 15%가 가장 살 사람, 무료 대안 대비 차별점 전달 부족):**
1. 2주차에 넘어가는 날 주차 팝업에서 "지난주 기록으로 만든 1주차 리포트"를 무료로 보여 주고, 끝에 "매주 받으려면 패스" 안내.
2. 편의점 판정을 패스 없이 3번 써 볼 수 있고, 4번째부터 패스 안내.
3. 필요한 순간 연결: 탐색에서 검색 결과가 없을 때 "편의점 판정으로 확인", 체중이 3일 이상 그대로일 때 정체기 안내 카드(→ 주간 리포트/패스).

## Global Constraints
- 무료 체험 남용 방지: 무료 리포트는 사용자당 평생 1번(회차를 다시 시작해도 1번), 무료 편의점 판정은 사용자당 평생 3번. 서버가 최종 판단(앱 표시는 참고).
- 판매가 꺼져 있으면(isPassOnSale false) 패스 안내는 숨기되 무료 체험은 그대로.
- 서버 변경은 작성만(마이그레이션 적용·함수 배포는 컨트롤러가 승인 후). 옛 앱(5.x, 6.0.0 빌드 69) 호환.
- UI는 Skill 도구로 `frontend-design:frontend-design` 먼저. 문구 해요체.
- TDD, 전체 vitest, tsc, deno check, eslint·prettier.

---

### Task 1: 1주차 리포트 1회 무료
- 서버: 마이그레이션(새 파일)로 무료 체험 기록(예: `user_trial(uid primary key, free_report_at timestamptz, food_check_used int default 0)` RLS on, 정책 없음, 서비스 롤 전용). generate-weekly-reports(공유 모듈 `_shared/weeklyReportGenerate.ts`): 패스가 없어도 **표시 주차 1** 리포트이고 무료 리포트를 아직 안 썼으면 생성하고 `free_report_at` 기록, 리포트 행에 무료 표시(`weekly_report.is_trial boolean default false`). 푸시는 기존 규칙.
- 앱: 주차 진입 팝업(2주차 진입)에 무료 리포트가 있으면 "지난주 기록으로 만든 1주차 리포트가 도착했어요 [보기]", 리포트 상세 하단에 무료 리포트면 "매주 받으려면 스위치온 패스"(판매 중일 때). 무료 리포트가 아직 생성 전이면 팝업은 기존대로.

### Task 2: 편의점 판정 3회 무료
- 서버: food-check의 패스 확인 앞에서, 패스가 없으면 `user_trial.food_check_used < 3`일 때 허용하고 성공 시 +1 (원자적 증가, 실패·환불 시 되돌리기 — 기존 quota consume/release 패턴 따라). 응답에 남은 무료 횟수.
- 앱: 편의점 판정 진입 게이트(usePremiumGate)가 무료 횟수가 남았으면 통과, 화면에 "무료 체험 N번 남았어요", 다 쓰면 패스 안내(기존 402 처리 재사용).

### Task 3: 필요한 순간 연결
- 탐색 검색 결과 0개 화면에 "편의점 음식이라면 판정으로 확인해 보세요 [편의점 판정]"(패스 없고 무료 체험도 끝났으면 패스 배지).
- 체중 기록이 최근 3일 이상 변화가 0.2kg 이내면 기록 탭 체중 칸에 정체기 안내 카드(책 근거 문구 한 줄 + "주간 리포트로 원인 보기" → 패스 사용자는 리포트, 아니면 패스). 하루 한 번 닫으면 그날 숨김.
