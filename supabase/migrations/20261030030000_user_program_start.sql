-- (1) user.program_start, (2) fasting_plan.created_at
--
-- 회차 시작일: 다시 시작·온보딩으로 시작한 회차의 첫날 (KST 날짜).
-- 한 주 더 하기·주차 맞추기로 start_date가 바뀌어도 회차는 그대로라, 기록 탭이 회차 단위로 리포트·단식 기록을 묶는다.
--
-- 구버전 앱 호환: 구버전은 이 열을 모르고 보내지도 않는다. 앱은 program_start가 null이거나 start_date보다 뒤면
-- start_date로 본다. 서버 함수(주간 리포트 등)는 이 열을 쓰지 않는다.
-- 권한: 앱은 start_date와 같은 update(본인 행)로 이 열을 쓴다. 열 단위 권한이 따로 있으면 함께 열어야 한다.
-- 배포 순서: 새 앱이 시작일을 바꿀 때 이 열을 함께 저장하므로, 앱 배포 전에 적용해야 한다.

alter table public.user add column if not exists program_start date;

-- start_date가 date든 text·timestamp든 앞 10자(yyyy-MM-dd)만 날짜로 옮긴다. 형식이 아니면 건너뛴다(null로 둠 → 앱이 start_date로 본다).
-- (weekly_report_candidates와 같은 방어. 2월 30일처럼 형식만 맞는 값은 없다고 본다)
update public.user
set program_start = left(start_date::text, 10)::date
where program_start is null
  and start_date is not null
  and start_date::text ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])';

-- 단식 계획 생성 시각: updated_at은 고칠 때마다 바뀌어서, 기록 탭이 "시작일을 언제 바꿨나"를 어림할 때
-- 고쳐도 바뀌지 않는 시각이 필요하다. 앱(새·구버전 모두)은 upsert에 created_at을 보내지 않고, PostgREST upsert
-- (on conflict do update)는 보낸 열만 바꾸므로 있던 행의 created_at은 그대로, 새 행은 기본값 now()를 받는다.
alter table public.fasting_plan add column if not exists created_at timestamptz;

update public.fasting_plan set created_at = updated_at where created_at is null;

alter table public.fasting_plan alter column created_at set default now();

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
