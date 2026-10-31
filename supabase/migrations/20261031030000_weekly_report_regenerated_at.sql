-- weekly_report.regenerated_at: 리포트를 [다시 만들기]로 마지막에 새로 만든 시각 (운영자 결정 2026-10-31)
-- - generate-my-report(로그인 사용자, 패스 전용)만 기록한다. cron·패스 구매 뒤 보충은 새 행만 만들고 이 열을 쓰지 않는다.
-- - 리포트(주)당 하루 1번(KST): 다시 만들기는 regenerated_at이 null이거나 오늘 00:00 KST 전일 때만, 조건부 update로
--   먼저 이 열을 차지한 뒤 Gemini를 부른다 (동시에 두 번 눌러도 한 번만). 실패하면 이전 값으로 되돌린다.
-- - 마지막 생성 시각 = coalesce(regenerated_at, created_at). 그 뒤 그 주 기록이 바뀌었는지는 새 열 없이 기존 열로 본다:
--   weight_log·todo_daily·fasting_result(그 주 day 범위)·fasting_plan(그 리포트 키)의 updated_at > 마지막 생성 시각.
--   (네 테이블 모두 updated_at이 있고 앱이 저장할 때마다 보낸다. 트리거가 없어 기기 시각이다. 삭제는 알 수 없다)
-- - 하루 상한(비용): 직접 만들기·다시 만들기를 합쳐 사용자당 KST 하루 5번 시도. generate-my-report가 Gemini 전에
--   consume_premium_quota(uid, 'report_on_demand')로 차감하고 Gemini가 실패해도 돌려주지 않는다
--   (같은 키를 다른 요청이 먼저 만들어 Gemini를 부르지 않은 경우만 release_premium_quota).
-- 구버전 앱(5.x, 6.0.0 빌드 69)은 select('*')로 읽어 모르는 열을 무시한다.
-- 배포 순서: 이 마이그레이션 → generate-my-report 배포 → 앱. (함수를 먼저 배포하면 직접 만들기·다시 만들기가 500)

alter table public.weekly_report add column if not exists regenerated_at timestamptz null;

-- 직접 만들기·다시 만들기 하루 상한 (premium_quota_setting은 20261021000000_premium_food_check.sql). 있으면 그대로
insert into public.premium_quota_setting (feature, daily)
values ('report_on_demand', 5)
on conflict (feature) do nothing;

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
