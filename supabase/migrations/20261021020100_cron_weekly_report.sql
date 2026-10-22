-- 주간 리포트 생성 cron: 매일 08:00 KST (= 23:00 UTC 전날), 재시도 08:30 KST (= 23:30 UTC 전날)
-- 체중 기록 알림 cron: 매일 09:00 KST (= 00:00 UTC)
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
