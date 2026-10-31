-- 한 주 더 하기 때 스위치온 패스 7일 연장 (운영자 결정 2026-10-31: "스위치온 패스는 한 회차 전체를 책임지는 서비스")
--
-- (1) pass_extension: 연장 기록. (uid, 새 시작일)마다 한 번만 늘린다. 엣지 함수(verify-pass-purchase,
--     sync-voided-purchases)가 만료일을 다시 계산할 때 구매와 함께 쌓으므로(연장 1행 = 7일), 새 구매·환불 회수가
--     연장분을 지우지 않는다.
-- (2) extend_pass_for_week_repeat(p_new_start): 앱이 한 주 더 하기로 시작일을 저장한 직후 부른다.
--     실패하거나 null이어도 한 주 더 하기 자체에는 영향이 없다.
--
-- 배포 순서: 이 마이그레이션 → verify-pass-purchase, sync-voided-purchases 배포 → 앱.
-- (두 함수는 pass_extension을 읽으므로 테이블이 먼저 있어야 한다)

create table if not exists public.pass_extension (
  uid uuid not null references public.user (id) on delete cascade,
  new_start_date date not null,
  extended_at timestamptz not null default now(),
  primary key (uid, new_start_date)
);

-- RLS 켜고 정책 없음: service role(엣지 함수)과 아래 security definer 함수만 접근한다
alter table public.pass_extension enable row level security;
revoke all on table public.pass_extension from public, anon, authenticated;

-- 새 만료일을 돌려준다. 다음 중 하나라도 아니면 아무것도 바꾸지 않고 null:
-- - 활성 패스(pass_expires_at > now())가 있다 (무료 기간만으로는 늘리지 않는다)
-- - user.start_date가 이미 p_new_start로 저장돼 있다 (시작일 저장 뒤에 부른다)
-- - 회차 시작일(program_start)이 그대로이고 p_new_start보다 앞이다: 한 주 더 하기이지 다시 시작이 아니다
--   (다시 시작은 program_start = start_date로 바꾼다)
-- - 같은 (uid, p_new_start)로 늘린 적이 없다 (재시도·중복 호출)
-- - 이번 회차(new_start_date > program_start)에 늘린 횟수가 4번 미만이다 (남용 상한 28일)
create or replace function public.extend_pass_for_week_repeat(p_new_start date)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
  v_program_start date;
  v_count integer;
begin
  if v_uid is null or p_new_start is null then return null; end if;

  -- 패스 행을 잠가 같은 유저의 동시 호출을 줄 세운다 (횟수 검사와 +7일이 한 번에 하나씩)
  select pass_expires_at into v_expires
  from public.user_pass
  where uid = v_uid
  for update;
  if v_expires is null or v_expires <= now() then return null; end if;

  -- start_date가 date든 text든 앞 10자(yyyy-MM-dd)로 비교한다 (user_program_start 마이그레이션과 같은 방어)
  select program_start into v_program_start
  from public.user
  where id = v_uid
    and left(start_date::text, 10) = to_char(p_new_start, 'YYYY-MM-DD');
  if v_program_start is null or v_program_start >= p_new_start then return null; end if;

  select count(*) into v_count
  from public.pass_extension
  where uid = v_uid
    and new_start_date > v_program_start;
  if v_count >= 4 then return null; end if;

  insert into public.pass_extension (uid, new_start_date)
  values (v_uid, p_new_start)
  on conflict do nothing;
  if not found then return null; end if;

  update public.user_pass
  set pass_expires_at = pass_expires_at + interval '7 days',
      updated_at = now()
  where uid = v_uid
  returning pass_expires_at into v_expires;
  return v_expires;
end;
$$;

revoke all on function public.extend_pass_for_week_repeat(date) from public, anon, authenticated;
grant execute on function public.extend_pass_for_week_repeat(date) to authenticated;

-- PostgREST가 새 함수를 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
