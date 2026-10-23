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
)
where p.start_minutes is null
  and p.start_time in ('아침 식후', '점심 식후', '저녁 식후')
  and coalesce(cardinality(p.days), 0) > 0;
