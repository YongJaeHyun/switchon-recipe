-- 체중 기록에 인바디 값(골격근량·체지방량, kg) 추가. 둘 다 선택 입력이라 null 허용.
-- 2·3주차가 끝날 때 시작 때와 비교해 "한 주 더 하기"를 제안하는 데 쓴다 (박용우 레시피북 p011·p018).
--
-- 구버전 앱 호환: 구버전은 upsert에 이 열을 보내지 않고, PostgREST upsert(on conflict do update)는
-- 보낸 열만 바꾸므로 같은 날 저장된 인바디 값이 그대로 남는다. 새 앱도 바꾼 필드만 보낸다.
-- 권한: weight_log RLS 정책(본인만 조회·추가·수정·삭제)은 행 단위라 새 열에도 그대로 적용된다.

alter table public.weight_log
  add column if not exists muscle_kg numeric(4, 1) null
    constraint weight_log_muscle_kg_range check (muscle_kg between 5.0 and 100.0),
  add column if not exists fat_kg numeric(4, 1) null
    constraint weight_log_fat_kg_range check (fat_kg between 1.0 and 200.0);

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
