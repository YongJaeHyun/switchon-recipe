-- 회차 시작일: 다시 시작·온보딩으로 시작한 회차의 첫날 (KST 날짜).
-- 한 주 더 하기·주차 맞추기로 start_date가 바뀌어도 회차는 그대로라, 기록 탭이 회차 단위로 리포트·단식 기록을 묶는다.
--
-- 구버전 앱 호환: 구버전은 이 열을 모르고 보내지도 않는다. 앱은 program_start가 null이거나 start_date보다 뒤면
-- start_date로 본다. 서버 함수(주간 리포트 등)는 이 열을 쓰지 않는다.
-- 권한: 앱은 start_date와 같은 update(본인 행)로 이 열을 쓴다. 열 단위 권한이 따로 있으면 함께 열어야 한다.
-- 배포 순서: 새 앱이 시작일을 바꿀 때 이 열을 함께 저장하므로, 앱 배포 전에 적용해야 한다.

alter table public.user add column if not exists program_start date;

update public.user set program_start = start_date where program_start is null;

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
