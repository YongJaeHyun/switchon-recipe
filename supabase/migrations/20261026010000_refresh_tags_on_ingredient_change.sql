-- 등록 재료(ingredient)가 바뀌면 레시피 검색용 재료 태그(recipe.ingredient_tags)를 자동으로 다시 계산한다.
-- 태그는 ingredient의 name·sub_keywords·is_active로 정해지므로, 이 셋이 바뀐 활성 재료가 있을 때만
-- refresh-ingredient-tags 엣지 함수(전체 레시피 재계산, 달라진 행만 update)를 net.http_post로 부른다.
--
-- - 문장 단위(for each statement) 트리거라 일괄 편집도 문장마다 한 번만 호출한다.
--   전이 테이블은 이벤트가 하나인 트리거에만 쓸 수 있어 INSERT/UPDATE/DELETE 트리거를 따로 두고 함수 하나를 같이 쓴다.
-- - pg_net 요청은 트랜잭션이 커밋된 뒤에 나가므로 함수는 커밋된 재료를 읽고, 롤백되면 호출도 없다.
-- - 호출 준비가 실패해도(시크릿 없음 등) 재료 편집(slack-ingredient-action 등)은 막지 않고 경고만 남긴다.
--   놓친 호출은 매일 04:50 KST(= 19:50 UTC) 안전망 cron이 전체 갱신으로 메운다
--   (다른 cron: 19:30 cleanup-food-check, 19:40 cleanup-weight-reminders, 20:00 sync-voided-purchases와 겹치지 않음).
-- - recipe.ingredients를 고치는 코드는 앱·엣지 함수에 없고(recipe update 정책 없음, 생성 시 createRecipe가 태그 계산)
--   그래서 recipe 쪽 트리거는 두지 않는다. Studio 등에서 손으로 고친 경우도 매일 cron이 맞춘다.
-- service role 키는 Vault(name = 'service_role_key')에서 읽는다 (cron 마이그레이션들과 같음).

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    raise exception 'Vault secret "service_role_key" is missing';
  end if;
end $$;

create or replace function public.refresh_ingredient_tags_on_ingredient_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  relevant boolean;
  service_key text;
begin
  -- 태그는 활성(is_active) 재료로만 만들므로 활성 재료와 관계없는 변경은 건너뛴다
  if tg_op = 'INSERT' then
    relevant := exists (select 1 from new_rows where is_active);
  elsif tg_op = 'DELETE' then
    relevant := exists (select 1 from old_rows where is_active);
  else
    relevant := exists (
      select 1
      from new_rows n full join old_rows o on o.id = n.id
      where (coalesce(o.is_active, false) or coalesce(n.is_active, false))
        and (
          o.id is null or n.id is null
          or n.name is distinct from o.name
          or n.sub_keywords is distinct from o.sub_keywords
          or n.is_active is distinct from o.is_active
        )
    );
  end if;

  if not relevant then return null; end if;

  begin
    select decrypted_secret into service_key from vault.decrypted_secrets where name = 'service_role_key';
    if service_key is null then
      raise warning 'refresh-ingredient-tags: Vault secret "service_role_key" is missing, skipped';
      return null;
    end if;

    perform net.http_post(
      url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/refresh-ingredient-tags',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  exception when others then
    raise warning 'refresh-ingredient-tags call failed: %', sqlerrm;
  end;

  return null;
end;
$$;

alter function public.refresh_ingredient_tags_on_ingredient_change() owner to postgres;
revoke all on function public.refresh_ingredient_tags_on_ingredient_change() from public, anon, authenticated;

drop trigger if exists ingredient_refresh_tags_ins on public.ingredient;
drop trigger if exists ingredient_refresh_tags_upd on public.ingredient;
drop trigger if exists ingredient_refresh_tags_del on public.ingredient;

create trigger ingredient_refresh_tags_ins
  after insert on public.ingredient
  referencing new table as new_rows
  for each statement
  execute function public.refresh_ingredient_tags_on_ingredient_change();

create trigger ingredient_refresh_tags_upd
  after update on public.ingredient
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.refresh_ingredient_tags_on_ingredient_change();

create trigger ingredient_refresh_tags_del
  after delete on public.ingredient
  referencing old table as old_rows
  for each statement
  execute function public.refresh_ingredient_tags_on_ingredient_change();

-- 안전망: 매일 04:50 KST (= 19:50 UTC) 전체 갱신. 달라진 행만 update하므로 평소엔 거의 쓰지 않는다
select cron.schedule(
  'refresh-ingredient-tags',
  '50 19 * * *',
  $cron$
  select net.http_post(
    url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/refresh-ingredient-tags',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);
