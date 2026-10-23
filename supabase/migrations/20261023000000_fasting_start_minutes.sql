-- 요일별 단식 시작 시각: { "<요일 0=일..6=토>": <KST 자정부터 분, 0..1439> }
-- start_time(옛 라벨)은 옛 앱·옛 서버 코드 호환을 위해 남긴다. 새 앱은 둘 다 쓰고, 읽을 때 start_minutes가 우선.
-- RLS 변화 없음 (기존 테이블 정책 그대로)

alter table public.fasting add column if not exists start_minutes jsonb;
alter table public.fasting_plan add column if not exists start_minutes jsonb;

-- 기존 행 채우기: 라벨 시각(아침 9:00, 점심 13:00, 저녁 19:00)을 days의 모든 요일에
update public.fasting f
set start_minutes = (
  select jsonb_object_agg(d::text, case f.start_time
    when '아침 식후' then 540
    when '점심 식후' then 780
    else 1140
  end)
  from (select distinct unnest(f.days) as d) days
  where d is not null
)
where f.start_minutes is null
  and f.start_time in ('아침 식후', '점심 식후', '저녁 식후')
  and coalesce(cardinality(f.days), 0) > 0;

update public.fasting_plan p
set start_minutes = (
  select jsonb_object_agg(d::text, case p.start_time
    when '아침 식후' then 540
    when '점심 식후' then 780
    else 1140
  end)
  from (select distinct unnest(p.days) as d) days
  where d is not null
)
where p.start_minutes is null
  and p.start_time in ('아침 식후', '점심 식후', '저녁 식후')
  and coalesce(cardinality(p.days), 0) > 0;

-- 옛 앱(5.x, 이전 6.0.0 빌드)은 days/start_time만 쓴다. 그러면 남은 start_minutes가 새 라벨보다 우선해 틀린 시각이 된다.
-- days나 start_time이 바뀌었는데 start_minutes는 그대로면 옛 앱 쓰기로 보고 start_minutes를 비운다 (라벨로 돌아감).
-- 새 앱(scheduleColumns)은 days/start_time을 바꿀 때 start_minutes도 항상 바꾸므로 걸리지 않는다
create or replace function public.clear_stale_fasting_start_minutes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.start_minutes is not distinct from old.start_minutes
    and (new.days is distinct from old.days or new.start_time is distinct from old.start_time) then
    new.start_minutes := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_stale_start_minutes on public.fasting;
create trigger clear_stale_start_minutes
  before update on public.fasting
  for each row execute function public.clear_stale_fasting_start_minutes();

drop trigger if exists clear_stale_start_minutes on public.fasting_plan;
create trigger clear_stale_start_minutes
  before update on public.fasting_plan
  for each row execute function public.clear_stale_fasting_start_minutes();
