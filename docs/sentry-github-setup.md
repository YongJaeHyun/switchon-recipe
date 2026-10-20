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

```bash
npx supabase db push                              # sentry_github_link 테이블 생성
npx supabase functions deploy sentry-to-github    # scripts/deployEdgeFunctions.sh에도 포함
```

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
   - **THEN**: `Send a notification via GitHub 이슈 자동 등록` (1단계에서 만든 통합 이름)
   - **Action interval**: 기본값 (함수가 Sentry 이슈당 1회만 만들므로 상관없음)
3. 저장

## 확인

- 테스트용 운영 오류를 일으키거나 Sentry 알림 규칙 화면의 **Send Test Notification**을 누른다
  (테스트 알림의 이벤트는 가짜 issue_id라 GitHub 이슈가 하나 만들어질 수 있다. 확인 후 닫으면 된다)
- 로그: Supabase 대시보드 → Edge Functions → `sentry-to-github` → Logs
- 응답
  - `200 {"ok":true,"created":true,"issueNumber":N}`: GitHub 이슈 생성
  - `200 {"ok":true,"created":false}`: 무시 (production 아님, 이미 등록됨, installation 등 다른 웹훅)
  - `401`: 서명 불일치 → `SENTRY_CLIENT_SECRET` 확인
  - `500`: GitHub 호출 실패 → `GITHUB_ISSUES_TOKEN` 권한/만료 확인. 중복 방지 행을 지우므로 다음 알림 때 다시 시도한다

## 참고

- 이슈 본문에는 Sentry 링크, 환경·릴리즈·레벨·플랫폼·발생 시각, culprit, 예외, 앱 코드 스택(최대 10개),
  `os`/`device`/`app.version` 태그만 들어간다. 사용자 정보(user 태그, 이메일, IP)는 넣지 않는다
- 앱 `Sentry.init`이 `environment`를 지정하지 않아서, environment가 없는 이벤트도 production으로 취급한다
- 이미 GitHub 이슈를 만든 Sentry 이슈를 다시 등록하고 싶으면 `sentry_github_link`에서 해당 행을 지운다
