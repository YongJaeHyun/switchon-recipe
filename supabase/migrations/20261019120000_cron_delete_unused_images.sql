-- delete-unused-images cron 재등록
-- 1) service role 키를 명령에 직접 적지 않고 Vault(name = 'service_role_key')에서 읽음
-- 2) 시간 제한 1초 → 30초 (응답 기록으로 성공 여부를 확인할 수 있게)
-- 적용 전 Vault에 'service_role_key' 시크릿이 있어야 함 (없으면 Authorization이 비어 401)

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

select cron.unschedule('delete-unused-images');

select cron.schedule(
  'delete-unused-images',
  '1 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/delete-unused-images',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 30000
  );
  $cron$
);
