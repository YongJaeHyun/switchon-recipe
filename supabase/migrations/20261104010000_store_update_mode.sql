-- 스토어 업데이트 안내 두 단계 스위치 (운영자 2026-11-04).
-- off = 안 띄움(기본), suggest = 닫을 수 있는 안내, force = 닫을 수 없는 필수 업데이트.
-- 옛 스토어 빌드에서만 뜬다 (앱이 네이티브 부품으로 판단). Play에서 새 버전이 모두에게 "사용 가능"이 된 뒤에 켠다:
--   update public.version set store_update_mode = 'suggest' where id = 1;
-- 옛 앱은 latest_version만 읽어서 영향 없음
alter table public.version
  add column if not exists store_update_mode text not null default 'off'
    constraint version_store_update_mode_check check (store_update_mode in ('off', 'suggest', 'force'));
