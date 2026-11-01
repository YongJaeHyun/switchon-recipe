-- 출시 할인 기간(premium_setting free_start~free_end)은 이제 5주 패스 첫 구매 할인에만 쓴다.
-- 그 기간에 패스 없는 사람에게 패스 기능을 열어 주던 무료 이용은 없앤다 (운영자 결정 2026-11-01).
create or replace function public.has_premium_access_for(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_pass
    where uid = p_uid
      and pass_expires_at > now()
  );
$$;
