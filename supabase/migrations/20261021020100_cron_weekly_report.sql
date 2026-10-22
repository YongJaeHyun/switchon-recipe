-- 주간 리포트 생성 cron: 매일 08:00 KST (= 23:00 UTC 전날), 재시도 08:30 KST (= 23:30 UTC 전날)
-- 체중 기록 알림 cron: 매일 09:00 KST (= 00:00 UTC)
-- 체중 기록 알림 정리 cron: 매일 04:40 KST (= 19:40 UTC). 7일 지난 WEIGHT_REMINDER 알림과
--   weight_reminder_sent 행을 지운다 (앱은 알림 목록을 보여주지 않고, 중복 막기는 오늘 행만 쓴다)
-- service role 키는 Vault(name = 'service_role_key')에서 읽는다 (없으면 Authorization이 비어 401)
-- 두 함수 모두 같은 날 다시 실행돼도 리포트·푸시가 중복되지 않는다

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

-- 대상 유저마다 Gemini를 부르므로 응답 대기를 길게 둔다
select cron.schedule(
  'generate-weekly-reports',
  '0 23 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/generate-weekly-reports',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 150000
  );
  $cron$
);

-- 재시도: 첫 실행이 시간 제한으로 끝나지 못한 유저를 마저 처리한다 (이미 만든 리포트는 건너뜀)
select cron.schedule(
  'generate-weekly-reports-retry',
  '30 23 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/generate-weekly-reports',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 150000
  );
  $cron$
);

select cron.schedule(
  'weight-reminder',
  '0 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/weight-reminder',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 30000
  );
  $cron$
);

-- DB 안에서만 지우므로 HTTP 호출·service role 키가 필요 없다
select cron.schedule(
  'cleanup-weight-reminders',
  '40 19 * * *',
  $cron$
  delete from public.notifications
  where type = 'WEIGHT_REMINDER' and created_at < now() - interval '7 days';
  delete from public.weight_reminder_sent
  where day < (now() at time zone 'Asia/Seoul')::date - 7;
  $cron$
);
