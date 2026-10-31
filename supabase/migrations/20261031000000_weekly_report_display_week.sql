-- (1) weekly_report.display_week, (2) weekly_report_candidates: 다시 시작 직전 회차의 마지막 완료 주 보충
--
-- (1) 리포트 제목에 쓰는 주차 = 실제로 지낸 주차.
-- 한 주 더 하기·주차 맞추기로 start_date가 바뀌면 같은 기간이 (새 시작일, 더 작은 week_index) 키로 다시 만들어진다
-- (운영자 결정 2026-10-31: 만들되 제목은 실제 주차로). week_index는 키(상세 경로 /report/{start_date}/{week_index})로
-- 그대로 두고, 제목·푸시·AI 문맥은 display_week를 쓴다 (generate-weekly-reports displayWeekFor).
-- 구버전 앱 호환: 5.x·6.0.0(빌드 69)은 이 열을 모르고 week_index로 제목을 붙인다 (예전 제목 그대로). 새 앱은
-- display_week ?? week_index. 그래서 null 허용이고, 있던 행은 week_index로 채운다.
-- 배포 순서: 이 마이그레이션 → generate-weekly-reports 함수 (새 함수는 display_week를 읽고 쓴다).

alter table public.weekly_report add column if not exists display_week integer null;

update public.weekly_report set display_week = week_index where display_week is null;

-- (2) 리포트 후보: 오늘이 start_date 기준 새 주차 1~3일차인 유저 (기존 그대로) +
-- 다시 시작 직전 회차의 마지막 완료 주 (감사 #3). 새 주차 1일차 08:00 전(또는 1일차 실행이 실패한 뒤 2·3일차 전)에
-- 다시 시작하면 유저의 start_date가 새 회차로 바뀌어 지난 회차 마지막 주 리포트가 만들어지지 않았다.
-- 지난 시작일은 저장하지 않으므로 그 시작일로 남은 행(weekly_report·fasting_plan의 start_date) 중 회차 시작일 전
-- 가장 최근 것을 쓴다. 그 시작일로 지낸 마지막 주가 끝난 뒤에 새 회차가 시작됐을 때만(program > 그 주 마지막 날) 돌려준다.
-- 한계: 그 시작일로 남은 행이 없으면(1주차만 지내고 다시 시작 → 단식 계획·리포트 없음) 보충하지 못한다.
-- 한계: 새 회차 시작일이 내일보다 뒤(program > p_today + 1)면 보충하지 않는다. 앱의 다시 시작은 오늘·내일만 고르므로
-- 보통 생기지 않지만, 새 주차 1일차에 4일 이상 뒤 날짜로 다시 시작(온보딩 등)하면 그 주 리포트는 빠진다.
-- 한 주 더 하기·주차 맞추기는 회차 시작일이 그대로거나 앞당겨져 지난 시작일 ≥ 회차 시작일이라 여기 걸리지 않는다
-- (그 기간은 새 시작일 키로 만들어지고 display_week로 제목이 붙는다). 구버전 앱의 다시 시작(program_start가 옛 값)도 걸리지 않는다.
-- 회차 시작일 = program_start (없거나 start_date보다 뒤면 start_date, 앱 programStartOf와 같은 규칙).
-- 리포트는 1~4주차와 유지기 1주차까지만 (운영자 결정 2026-10-31): 끝난 주차 week_index = (p_today − 시작일) / 7이
-- 5 이하인 것만 돌려준다. 최종 판단은 엣지 함수가 표시 주차로 한다 (MAX_REPORT_WEEK, 08:00 전 한 주 더로
-- week_index 5가 실제 6주차일 수 있다). week_index 6 이상인데 표시 주차가 5 이하인 경우(이미 있는 리포트와 4일
-- 이상 겹침)는 주차 맞추기가 많아야 5주차 1일로 앞당기므로 생기지 않는다.
create or replace function public.weekly_report_candidates(p_today date)
returns table (uid uuid, start_date date)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select
      u.id as uid,
      case
        when u.start_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(u.start_date::text, 10)::date
      end as start_date,
      u.program_start
    from public.user u
    where u.start_date is not null
  ),
  e as (
    select
      c.uid,
      c.start_date,
      case
        when c.program_start is not null and c.program_start <= c.start_date then c.program_start
        else c.start_date
      end as program
    from c
    where c.start_date is not null
  ),
  p as (
    select e.uid, max(s.start_date) as start_date, e.program
    from e
    join (
      select r.uid, r.start_date from public.weekly_report r
      union
      select f.uid, f.start_date from public.fasting_plan f
    ) s on s.uid = e.uid and s.start_date < e.program
    where e.program <= p_today + 1
    group by e.uid, e.program
  )
  select e.uid, e.start_date
  from e
  where e.start_date <= p_today - 7
    and (p_today - e.start_date) % 7 < 3
    and (p_today - e.start_date) / 7 <= 5
  union
  select p.uid, p.start_date
  from p
  where p.start_date <= p_today - 7
    and (p_today - p.start_date) % 7 < 3
    and (p_today - p.start_date) / 7 <= 5
    and p.program > p_today - (p_today - p.start_date) % 7 - 1;
$$;

revoke all on function public.weekly_report_candidates(date) from public, anon, authenticated;
grant execute on function public.weekly_report_candidates(date) to service_role;

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
