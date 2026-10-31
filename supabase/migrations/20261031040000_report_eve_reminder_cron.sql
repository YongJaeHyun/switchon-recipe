-- 리포트 전날 기록 알림 (report-eve-reminder): 매일 20:00 KST (= 11:00 UTC)
-- 내일 08:00 generate-weekly-reports가 리포트를 만들 유저(새 주차 1일차, 표시 주차 1~5, 패스 또는 무료 1주차 대상) 중
-- 오늘 체중 기록이 없는 유저에게 "내일 아침 N주차 리포트가 나와요" 알림을 넣는다 (기존 push 함수가 발송).
-- 후보는 내일 실행과 같은 weekly_report_candidates(내일)를 쓰므로 새 SQL 함수는 없다.
-- 정리 cron: 매일 04:45 KST (= 19:45 UTC). 7일 지난 REPORT_EVE_REMINDER 알림과 report_eve_reminder_sent 행을 지운다
-- service role 키는 Vault(name = 'service_role_key')에서 읽는다 (없으면 Authorization이 비어 401)
-- 배포 순서: report-eve-reminder 함수 배포 → 이 마이그레이션 (cron이 없는 함수를 부르지 않게)

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

-- 알림을 보낸 날 (edge function이 service role로 기록). (uid, day) 기본키로
-- 같은 날 실행이 겹쳐도 한 번만 보낸다: insert ... on conflict do nothing 후 새로 들어간 유저에게만 알림
create table if not exists public.report_eve_reminder_sent (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (uid, day)
);

-- 정책 없음 (service role 전용)
alter table public.report_eve_reminder_sent enable row level security;
revoke all on table public.report_eve_reminder_sent from public, anon, authenticated;

select cron.schedule(
  'report-eve-reminder',
  '0 11 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/report-eve-reminder',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 60000
  );
  $cron$
);

-- DB 안에서만 지우므로 HTTP 호출·service role 키가 필요 없다
select cron.schedule(
  'cleanup-report-eve-reminders',
  '45 19 * * *',
  $cron$
  delete from public.notifications
  where type = 'REPORT_EVE_REMINDER' and created_at < now() - interval '7 days';
  delete from public.report_eve_reminder_sent
  where day < (now() at time zone 'Asia/Seoul')::date - 7;
  $cron$
);

-- PostgREST가 새 테이블을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
