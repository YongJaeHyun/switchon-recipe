-- Sentry 이슈 → GitHub 이슈 중복 생성 방지 + 실패 재시도 (sentry-to-github 함수 전용)
-- RLS 켜고 정책 없음: service role만 접근

create table public.sentry_github_link (
  sentry_issue_id text primary key,
  github_issue_number int,
  -- 재시도 시 다시 만들 GitHub 이슈 내용 { title, body }
  payload jsonb,
  -- 시도 횟수 (최초 시도 포함). 5회 미만일 때만 재시도
  attempts int not null default 0,
  -- 마지막 GitHub 이슈 생성 실패 메시지 (성공 시 null)
  last_error text,
  -- 마지막 시도 시각. 시도 중인 행을 다른 요청이 동시에 재시도하지 않도록 하는 임대 기준
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.sentry_github_link enable row level security;
revoke all on public.sentry_github_link from anon, authenticated;

create index sentry_github_link_pending_idx
  on public.sentry_github_link (created_at)
  where github_issue_number is null;
