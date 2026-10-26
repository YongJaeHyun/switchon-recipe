-- 편의점 판정 원본 사진 30일 정리 cron: 매일 04:30 KST (= 19:30 UTC)
-- service role 키는 Vault(name = 'service_role_key')에서 읽는다 (없으면 Authorization이 비어 401)

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

select cron.schedule(
  'cleanup-food-check-images',
  '30 19 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/cleanup-food-check-images',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    timeout_milliseconds := 30000
  );
  $cron$
);
