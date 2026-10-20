-- get_recipe_quota 응답에 dailyLimit(광고 보상을 뺀 기본 하루 한도) 추가.
-- 화면의 "N/5개", "N/20개" 표시에 쓴다. 기존 키는 그대로라 이미 배포된 앱과 호환된다.

create or replace function public.get_recipe_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_setting public.quota_setting%rowtype;
  v_is_pass boolean;
  v_used integer := 0;
  v_ad_bonus integer := 0;
  v_limit integer;
begin
  select * into v_setting from public.quota_setting where id = 1;
  if not found then
    raise exception 'quota_setting 행(id=1)이 없습니다';
  end if;

  v_is_pass := exists (
    select 1
    from public.user_pass
    where uid = v_uid
      and pass_expires_at > now()
  );

  select ru.used, ru.ad_bonus
    into v_used, v_ad_bonus
  from public.recipe_usage ru
  where ru.uid = v_uid
    and ru.day = v_day;

  if not found then
    v_used := 0;
    v_ad_bonus := 0;
  end if;

  v_limit := case when v_is_pass then v_setting.pass_daily
                  else v_setting.free_daily + v_ad_bonus end;

  return jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'adBonusLeft', case when v_is_pass then 0
                        when v_used >= v_setting.free_daily + v_ad_bonus + 1 then 0
                        else greatest(v_setting.ad_bonus_daily - v_ad_bonus, 0) end,
    'isPass', v_is_pass,
    -- 화면에 보여줄 기본 하루 한도 (광고 보상은 포함하지 않음: 무료 free_daily, 패스 pass_daily)
    'dailyLimit', case when v_is_pass then v_setting.pass_daily else v_setting.free_daily end
  );
end;
$$;

revoke all on function public.get_recipe_quota() from public, anon, authenticated;
grant execute on function public.get_recipe_quota() to authenticated;
