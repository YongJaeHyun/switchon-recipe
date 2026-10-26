-- 환불·취소된 패스 구매 회수 cron: 매일 05:00 KST (= 20:00 UTC)
-- 함수가 최근 7일치를 다시 보므로 며칠 실패해도 다음 실행에서 복구된다
-- service role 키는 Vault(name = 'service_role_key')에서 읽는다 (없으면 Authorization이 비어 401)

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

select cron.schedule(
  'sync-voided-purchases',
  '0 20 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/sync-voided-purchases',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 30000
  );
  $cron$
);
