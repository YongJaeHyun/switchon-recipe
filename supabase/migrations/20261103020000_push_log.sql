-- 푸시 발송 결과 기록 (push 함수가 남긴다). "알림을 못 받았다"고 하면 어디서 끊겼는지 본다:
-- sent(Expo가 받음, ticket_id) / no_token(푸시 토큰 없음) / expo_error(Expo 거절, 앱 삭제 등) / failed(함수 오류).
-- 서비스 역할만 쓴다 (RLS 켜고 정책 없음). 30일 지난 기록은 매일 지운다.
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  notification_id bigint,
  uid uuid,
  type text,
  status text not null check (status in ('sent', 'no_token', 'expo_error', 'failed')),
  ticket_id text,
  error text
);

create index if not exists push_log_created_at_idx on public.push_log (created_at desc);
create index if not exists push_log_uid_idx on public.push_log (uid, created_at desc);

alter table public.push_log enable row level security;

select cron.schedule(
  'cleanup-push-log',
  '30 19 * * *',
  $$delete from public.push_log where created_at < now() - interval '30 days'$$
);
