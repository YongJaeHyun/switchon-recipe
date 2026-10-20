# Sentry 운영 오류 → GitHub 이슈 자동 등록 설정

운영(production) 앱에서 **새 Sentry 이슈**가 생기면 `sentry-to-github` Edge Function이
`YongJaeHyun/switchon-recipe` 저장소에 `sentry` 라벨이 붙은 GitHub 이슈를 만든다.
같은 Sentry 이슈로는 GitHub 이슈를 한 번만 만든다 (`sentry_github_link` 테이블).

```
Sentry 알림 규칙 (새 이슈, environment=production)
  → "Send a notification via <Internal Integration>"
  → POST https://hhewuyfclrapnchhltod.supabase.co/functions/v1/sentry-to-github
  → GitHub 이슈 생성 (라벨: sentry)
```

## 0. 배포

> 배포(아래 명령)는 컨트롤러가 직접 실행한다. 운영자는 1~4단계(외부 서비스 설정, 시크릿)만 하면 된다.

사전 조건: `npx supabase login` 으로 로그인, `npx supabase link --project-ref hhewuyfclrapnchhltod` 으로 프로젝트 연결.

```bash
npx supabase db push                              # 아직 적용 안 된 마이그레이션 전부 적용 (sentry_github_link 포함)
npx supabase functions deploy sentry-to-github    # scripts/deployEdgeFunctions.sh에도 포함
```

`db push`는 이 기능의 마이그레이션만이 아니라 **원격에 아직 없는 모든 마이그레이션**을 올린다.
먼저 `npx supabase migration list`로 무엇이 올라갈지 확인한다.

`supabase/config.toml`에서 이 함수는 `verify_jwt = false`이다 (Sentry는 Supabase JWT를 보내지 않음).
대신 `Sentry-Hook-Signature` 서명을 검증한다.

## 1. Sentry Internal Integration 만들기

1. Sentry → **Settings → Developer Settings → Custom Integrations → Create New Integration → Internal Integration**
2. 입력
   - **Name**: `GitHub 이슈 자동 등록` (자유)
   - **Webhook URL**: `https://hhewuyfclrapnchhltod.supabase.co/functions/v1/sentry-to-github`
   - **Alert Rule Action**: 켜기 (알림 규칙에서 이 통합을 액션으로 고를 수 있게 됨)
   - **Permissions**: **Issue & Event → Read**. 나머지는 No Access
   - **Webhooks** 구독 체크박스(issue 등)는 켜지 않아도 된다 (함수가 무시함)
3. 저장 후 화면의 **Client Secret**을 복사한다 (다음 단계에서 사용)

## 2. GitHub fine-grained 토큰 만들기

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. 입력
   - **Resource owner**: `YongJaeHyun`
   - **Repository access**: **Only select repositories** → `switchon-recipe`만
   - **Repository permissions → Issues**: **Read and write**
   - 만료일은 적당히 지정하고, 만료 전에 갱신한다 (만료되면 이슈 생성이 401로 실패)
3. 생성된 토큰을 복사한다

`sentry` 라벨이 저장소에 없으면 Issues 쓰기 권한이 있는 토큰으로 이슈를 만들 때 GitHub가 자동으로 만든다.
색상을 정하고 싶으면 미리 **Issues → Labels**에서 `sentry` 라벨을 만들어 둔다.

## 3. Supabase 시크릿 설정

```bash
npx supabase secrets set SENTRY_CLIENT_SECRET=<1단계의 Client Secret>
npx supabase secrets set GITHUB_ISSUES_TOKEN=<2단계의 토큰>
```

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 자동으로 넣어준다
- (선택) 다른 저장소로 보내려면 `GITHUB_REPO=owner/repo`. 기본값은 `YongJaeHyun/switchon-recipe`

## 4. Sentry 알림 규칙 만들기

1. Sentry → **Alerts → Create Alert → Issues** (프로젝트: 스위치온 레시피 앱)
2. 설정
   - **Environment**: `production`
   - **WHEN**: `A new issue is created`
   - **THEN**: `Send a notification via ...` 드롭다운에서 **1단계에서 정한 통합 이름**(예: `GitHub 이슈 자동 등록`)을 고른다
   - **Action interval**: 기본값 (함수가 Sentry 이슈당 1회만 만들므로 상관없음)
3. 저장

## 확인

- 테스트용 운영 오류를 일으키거나, 아래 **테스트 알림**을 보낸다
- 로그: Supabase 대시보드 → Edge Functions → `sentry-to-github` → Logs
- 응답 (Sentry는 약 1초 안에 응답을 받아야 해서, 서명·필터만 확인하고 바로 응답한다.
  GitHub 이슈 생성은 응답 후 백그라운드에서 진행되므로 결과는 로그와 `sentry_github_link` 테이블로 확인한다)
  - `200 {"ok":true,"accepted":true}`: 접수. 곧 GitHub 이슈가 만들어진다
  - `200 {"ok":true,"accepted":false}`: 무시 (production 아님, installation 등 다른 웹훅)
  - `401`: 서명 불일치 → `SENTRY_CLIENT_SECRET` 확인 (시크릿이 비어 있으면 로그에 `SENTRY_CLIENT_SECRET not set`)
  - `413`: 본문 1MB 초과
  - 이미 GitHub 이슈를 만든 Sentry 이슈는 `accepted:true`여도 새로 만들지 않는다

### "Send Test Notification" 버튼은 진짜 GitHub 이슈를 만들 수 있다

알림 규칙 화면의 **Send Test Notification**은 실제와 같은 `event_alert` 웹훅을 서명까지 해서 보낸다.
테스트 이벤트도 environment가 production이거나 비어 있으면 함수는 진짜 오류와 구분할 수 없으므로,
`[Sentry] ...` 제목의 GitHub 이슈가 **실제로 하나 생성될 수 있다**. 연결 확인용으로는 좋지만 할 일 목록에 남지 않게 정리한다.

1. GitHub 저장소 → Issues → 라벨 `sentry`로 방금 생긴 이슈를 연다
2. 본문의 Sentry 링크가 테스트 이벤트인지 확인한 뒤 **Close issue → Close as not planned**로 닫는다
   (코멘트로 "Sentry 테스트 알림"이라고 남겨 두면 나중에 헷갈리지 않는다)
3. 같은 테스트 알림을 다시 보내도 같은 Sentry 이슈 ID면 새 GitHub 이슈는 만들어지지 않는다.
   다시 생성해 보고 싶으면 SQL Editor에서 해당 행을 지운다:
   `delete from sentry_github_link where sentry_issue_id = '<Sentry 이슈 ID>';`

## 실패와 재시도

Sentry는 웹훅 실패 시 재전송을 보장하지 않으므로 함수가 직접 재시도한다.

- GitHub 이슈 생성이 실패하면 `sentry_github_link` 행은 남기고 `github_issue_number = null`, `last_error`(오류 메시지),
  `attempts`(시도 횟수)를 기록한다. 이슈 제목·본문은 `payload`에 저장되어 있다
- 이후 **어떤 웹훅이든** 서명이 맞게 들어오면, 백그라운드에서 실패한 행을 오래된 순으로 최대 3개 다시 시도한다
  (`attempts < 5`, 마지막 시도 후 2분 이상 지난 행만)
- 5번 모두 실패한 행은 더 시도하지 않는다. 확인 쿼리:
  `select * from sentry_github_link where github_issue_number is null order by created_at;`
  원인(`last_error`, 보통 토큰 만료·권한)을 고친 뒤 `update sentry_github_link set attempts = 0 where github_issue_number is null;`
  하면 다음 웹훅 때 다시 시도한다
- 새 오류가 뜸해서 웹훅이 오지 않으면 재시도도 그만큼 늦어진다

## 참고

- 이슈 본문에는 Sentry 링크, 환경·릴리즈·레벨·플랫폼·발생 시각, culprit, 예외, 앱 코드 스택(최대 10개),
  `os`/`device`/`app.version` 태그만 들어간다. 사용자 정보(user 태그, 이메일, IP)는 넣지 않는다
- 앱 `Sentry.init`이 `environment`를 지정하지 않아서, 최상위 environment가 없으면 `environment` 태그를 보고, 둘 다 없을 때만 production으로 취급한다
- 해결(resolved)했던 Sentry 이슈가 다시 발생(regression, resolved → unresolved)해도 **새 GitHub 이슈는 만들지 않는다**.
  알림 조건이 "새 이슈 생성"뿐이고, 같은 Sentry 이슈 ID는 이미 `sentry_github_link`에 있기 때문이다.
  재발을 추적하려면 기존 GitHub 이슈를 다시 열거나, 해당 행을 지우고 알림 조건에 regression을 추가한다
- 이미 GitHub 이슈를 만든 Sentry 이슈를 다시 등록하고 싶으면 `sentry_github_link`에서 해당 행을 지운다
- 드물게 GitHub 이슈는 만들어졌는데 번호 저장(DB)만 실패하면, 2분 뒤 재시도에서 같은 내용의 이슈가 한 번 더 생길 수 있다. 중복은 닫으면 된다
