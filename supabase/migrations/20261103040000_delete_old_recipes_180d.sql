-- 아무도 저장하지 않은 레시피를 지우는 기간을 30일 → 180일로 (운영자 2026-11-03).
-- 30일은 프로그램(5주+)보다 짧고, 만든 비용(레시피당 약 60원)을 버리며 추천에 쓸 레시피가 줄어든다.
-- 사진 저장 용량은 한 달에 약 20MB라 부담이 없다. 매일 00:00(UTC)에 도는 예약 작업 명령만 바꾼다
select cron.alter_job(
  (select jobid from cron.job where jobname = 'delete-old-recipes'),
  command := $cmd$DELETE FROM recipe r WHERE r.created_at < NOW() - INTERVAL '180 days'
  AND NOT EXISTS (
    SELECT 1
    FROM saved_recipe sr
    WHERE sr.recipe_id = r.id
  );$cmd$
);
