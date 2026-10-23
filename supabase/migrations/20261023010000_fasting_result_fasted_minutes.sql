-- 일찍 끝낸 단식의 단식한 시간(분). result는 그대로 'broken'(옛 앱·서버 호환), 성공이거나 옛 기록이면 null.
-- RLS 변화 없음 (기존 테이블 정책 그대로)
alter table public.fasting_result
  add column if not exists fasted_minutes integer null check (fasted_minutes between 0 and 1440);
