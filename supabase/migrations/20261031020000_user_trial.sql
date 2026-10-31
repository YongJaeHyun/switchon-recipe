-- 패스 없이 써 보는 무료 체험 기록 (운영자 결정 2026-10-31 "써 보게 한 뒤 팔기")
-- - free_report_at: 무료 1주차 리포트를 만든 시각 (사용자당 평생 1번, 회차를 다시 시작해도 1번). generate-weekly-reports가 기록
-- - food_check_used: 패스 없이 쓴 편의점 판정 횟수 (사용자당 평생 3번). food-check가 아래 함수로 늘리고 되돌린다
-- 서버가 최종 판단한다 (앱 표시는 get-pass-status의 foodCheckTrialRemaining을 참고만 한다).
--
-- weekly_report.is_trial: 패스 없이 무료 체험으로 만든 1주차 리포트 (앱이 리포트 상세에 패스 안내를 붙인다).
-- 구버전 앱(5.x, 6.0.0 빌드 69)은 이 열을 모르고 보통 리포트로 보여 준다.
--
-- 배포 순서: 이 마이그레이션 → food-check, get-pass-status, generate-weekly-reports 배포 → 앱.
-- (generate-weekly-reports를 먼저 배포하면 is_trial 열·claim_free_report가 없어 cron이 실패한다)

create table if not exists public.user_trial (
  uid uuid primary key references public.user (id) on delete cascade,
  free_report_at timestamptz,
  food_check_used int not null default 0 check (food_check_used >= 0),
  updated_at timestamptz default now()
);

-- RLS 켜고 정책 없음: service role(엣지 함수)과 아래 security definer 함수만 접근한다
alter table public.user_trial enable row level security;
revoke all on table public.user_trial from public, anon, authenticated;

-- 무료 판정 1번을 원자적으로 쓴다. 쓴 뒤 남은 횟수를 돌려주고, 이미 p_limit번을 다 썼거나 public.user 행이 없으면 -1.
-- 행이 없으면 만든 뒤 조건부 update 한 번으로 늘리므로 동시 요청에도 p_limit을 넘지 않는다. service role 전용
create or replace function public.consume_food_check_trial(p_uid uuid, p_limit int)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  -- public.user 행이 없는 사용자(온보딩 전)는 FK 위반 → 500 대신 다 쓴 것처럼 -1 (food-check가 402)
  begin
    insert into public.user_trial (uid)
    values (p_uid)
    on conflict (uid) do nothing;
  exception when foreign_key_violation then
    return -1;
  end;

  update public.user_trial
    set food_check_used = food_check_used + 1,
        updated_at = now()
  where uid = p_uid
    and food_check_used < p_limit
  returning food_check_used into v_used;

  if not found then
    return -1;
  end if;

  return greatest(p_limit - v_used, 0);
end;
$$;

revoke all on function public.consume_food_check_trial(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_food_check_trial(uuid, int) to service_role;

-- 판정이 실패(인식 실패·Gemini 오류·저장 실패·하루 한도 초과)하면 쓴 1번을 되돌린다 (0 미만 금지). service role 전용
create or replace function public.release_food_check_trial(p_uid uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.user_trial
    set food_check_used = greatest(food_check_used - 1, 0),
        updated_at = now()
  where uid = p_uid;
$$;

revoke all on function public.release_food_check_trial(uuid) from public, anon, authenticated;
grant execute on function public.release_food_check_trial(uuid) to service_role;

-- 무료 1주차 리포트 (generate-weekly-reports). 패스 없는 유저도 표시 주차 1 리포트는 사용자당 평생 1번 받는다
alter table public.weekly_report add column if not exists is_trial boolean not null default false;

-- 무료 리포트를 원자적으로 쓴다: free_report_at이 비어 있으면 지금으로 채우고 true, 이미 썼으면 false.
-- 조건부 update 한 번이라 동시 실행 중 하나만 true. public.user 행이 없으면 false. service role 전용
create or replace function public.claim_free_report(p_uid uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  begin
    insert into public.user_trial (uid)
    values (p_uid)
    on conflict (uid) do nothing;
  exception when foreign_key_violation then
    return false;
  end;

  update public.user_trial
    set free_report_at = now(),
        updated_at = now()
  where uid = p_uid
    and free_report_at is null;

  return found;
end;
$$;

revoke all on function public.claim_free_report(uuid) from public, anon, authenticated;
grant execute on function public.claim_free_report(uuid) to service_role;

-- 리포트를 저장하지 못하면(기록 없음·오류·키 충돌) 쓴 무료 리포트를 되돌린다. service role 전용
create or replace function public.release_free_report(p_uid uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.user_trial
    set free_report_at = null,
        updated_at = now()
  where uid = p_uid;
$$;

revoke all on function public.release_free_report(uuid) from public, anon, authenticated;
grant execute on function public.release_free_report(uuid) to service_role;

-- PostgREST가 새 열(is_trial)을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
