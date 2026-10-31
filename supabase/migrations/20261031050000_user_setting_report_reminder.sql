-- 리포트 알림 켜기·끄기 (운영자 결정 2026-10-31, 내 정보 "리포트 알림"). 기본 켜짐.
-- 끄면 주간 리포트 도착 푸시(generate-weekly-reports cron·무료 1주차 포함, verify-pass-purchase 구매 뒤 보충)와
-- 리포트 전날 기록 알림(report-eve-reminder)을 보내지 않는다. 리포트 자체는 그대로 만든다.
-- user_setting 행이 없는 유저 = 켜짐 (함수는 report_reminder = false 행만 읽는다).
-- 앱은 기존 정책("본인 설정만", for all)으로 자기 행을 읽고 쓴다. 구버전 앱은 이 열을 모르고 upsert에 넣지 않아 기본값이 남는다.
-- 배포 순서: 이 마이그레이션 → generate-weekly-reports, verify-pass-purchase, report-eve-reminder 배포 → 앱
-- (함수를 먼저 배포하면 없는 열을 읽어 cron·푸시가 실패한다)

alter table public.user_setting add column if not exists report_reminder boolean not null default true;

-- PostgREST가 새 열을 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
