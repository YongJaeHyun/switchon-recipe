-- 패스 없이 써 보는 무료 체험 기록 (운영자 결정 2026-10-31 "써 보게 한 뒤 팔기")
-- - free_report_at: 무료 1주차 리포트를 만든 시각 (사용자당 평생 1번, 회차를 다시 시작해도 1번). generate-weekly-reports가 기록
-- - food_check_used: 패스 없이 쓴 편의점 판정 횟수 (사용자당 평생 3번). food-check가 아래 함수로 늘리고 되돌린다
-- 서버가 최종 판단한다 (앱 표시는 get-pass-status의 foodCheckTrialRemaining을 참고만 한다).
--
-- 배포 순서: 이 마이그레이션 → food-check, get-pass-status (, generate-weekly-reports) 배포 → 앱.

create table if not exists public.user_trial (
  uid uuid primary key references public.user (id) on delete cascade,
  free_report_at timestamptz,
  food_check_used int not null default 0 check (food_check_used >= 0),
  updated_at timestamptz default now()
);

-- RLS 켜고 정책 없음: service role(엣지 함수)과 아래 security definer 함수만 접근한다
alter table public.user_trial enable row level security;
revoke all on table public.user_trial from public, anon, authenticated;

-- 무료 판정 1번을 원자적으로 쓴다. 쓴 뒤 남은 횟수를 돌려주고, 이미 p_limit번을 다 썼으면 -1.
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
  insert into public.user_trial (uid)
  values (p_uid)
  on conflict (uid) do nothing;

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
