-- 앱 리뷰 묻기에서 [아쉬워요]로 받은 사용자 의견 (운영자 결정 2026-11-01).
-- send-feedback 엣지 함수(service role)만 넣는다. RLS를 켜고 클라이언트 정책은 두지 않는다 → 앱은 읽기·쓰기 모두 불가.
-- 한 사람당 KST 하루 한 번: 함수가 먼저 확인하고, 동시에 두 번 와도 (uid, kst_day) 유일 제약이 막는다 (23505 → 429).
-- Slack에는 uid를 보내지 않는다. 누가 보냈는지는 이 표에만 남는다.

create table if not exists public.app_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  uid uuid not null references auth.users (id) on delete cascade,
  -- 앱이 500자로 막고 함수가 다듬어 넣는다
  message text not null check (char_length(message) between 1 and 500),
  app_version text,
  week integer,
  has_pass boolean,
  -- 묻는 순간: week2(2주차 진입 팝업을 닫은 뒤) · saved3(레시피 3개째 저장)
  trigger text not null check (trigger in ('week2', 'saved3')),
  -- 하루 한 번 제한용 KST 날짜
  kst_day date not null default ((now() at time zone 'Asia/Seoul')::date)
);

create unique index if not exists app_feedback_uid_kst_day_key
  on public.app_feedback (uid, kst_day);

create index if not exists app_feedback_created_at_idx
  on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

revoke all on public.app_feedback from anon, authenticated;
