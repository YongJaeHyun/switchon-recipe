# 카카오톡 공유 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 레시피 공유를 고치고, 초대·완주 인증·편의점 판정 결과를 카카오톡으로 공유한다.

**Spec (운영자 결정 2026-10-31 "추천 순서대로 진행해줘"):** 순서 1 레시피 공유 개선 → 2 같이 하자 초대 → 3 완주 인증 카드 → 4 편의점 판정 결과. UI는 시안 확인 후 구현(운영자 규칙), Skill `frontend-design:frontend-design` 필수.

## Global Constraints
- 카카오 메시지 모양은 카카오 개발자 콘솔 템플릿(운영자가 만듦). 템플릿 ID가 없으면 `shareFeedTemplate`(기본 피드)로 대신하고 ID 상수 한 곳(`const/kakaoTemplates.ts`).
- 받는 사람 흐름은 `app/kakaolink.tsx` 하나로: 링크 파라미터(`recipe`, `invite`, `foodCheck` …)를 해석해 로그인/온보딩 뒤 목적지로 이동(알림 게이트의 pendingHref 재사용). 앱이 없으면 스토어.
- 민감 정보(체중·인바디 숫자)는 기본으로 넣지 않는다. 넣으면 사용자가 켠 경우만.
- 서버 변경 없음(초대 보상은 이번 범위 밖).
- TDD, 전체 vitest, tsc, eslint·prettier.

### Task 1: 레시피 공유 개선
- 받은 사람이 로그인 안 했으면 로그인·온보딩 뒤 그 레시피로 이어지게(pendingHref). 앱 미설치 시 스토어(템플릿 링크 설정 확인). 메시지 버튼 문구 "나도 만들어 보기"는 템플릿 쪽이라 운영자 안내.
### Task 2: 같이 하자 초대
- 내 정보·시작 전 카드·완주 축하에 "같이 할 사람 초대" → 카카오 공유("나 {내일/오늘}부터 스위치온 시작해. 같이 할래?"). 링크에 `invite=<시작일>`. 받은 신규 사용자는 온보딩 "언제부터 시작" 단계에 "친구와 같은 날 시작 (M/D)" 선택지를 맨 위에(과거면 그 날짜 기준 주차 맞추기로).
### Task 3: 완주 인증 카드
- 완주 축하 시트·완주 달력에 "자랑하기" → 이미지 카드(react-native-view-shot 등 이미 있는 의존성 확인, 없으면 텍스트 피드) + 카카오 공유. 기본 문구 "스위치온 N주차 완주! 🔥 7일 중 N일 완주", 체중 감량은 토글로만.
### Task 4: 편의점 판정 결과 공유
- 판정 결과 화면에 "친구에게 알려주기" → "{음식}, 스위치온 N주차에 먹어도 돼요 ✅ / 피하는 게 좋아요" + 링크(받은 사람: 앱의 편의점 판정으로).
