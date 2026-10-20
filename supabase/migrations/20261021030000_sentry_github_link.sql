-- Sentry 이슈 → GitHub 이슈 중복 생성 방지 (sentry-to-github 함수 전용)
-- RLS 켜고 정책 없음: service role만 접근

create table public.sentry_github_link (
  sentry_issue_id text primary key,
  github_issue_number int,
  created_at timestamptz default now()
);

alter table public.sentry_github_link enable row level security;
