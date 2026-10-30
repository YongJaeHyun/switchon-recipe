-- 외부 AI·이미지 API(Gemini, Pixabay) 장애 Slack 알림의 중복 방지 기록 (_shared/providerAlert.ts).
-- 엣지 함수가 실패를 감지하면 (provider, kind, hour) 행을 insert하고, 새로 들어간 경우(기본키 충돌 없음)에만
-- Slack에 보낸다. 그래서 실패가 쏟아져도 같은 provider·유형 알림은 1시간에 한 번이다.
-- recovered_at: billing·auth 알림 뒤 24시간 안에 호출이 다시 성공하면 채우고 "복구됨"을 한 번 보낸다.
--
-- 권한: RLS를 켜고 정책을 두지 않아 service role(엣지 함수)만 읽고 쓴다. 행은 provider·유형·시간당 최대 1개라
-- 장애가 계속돼도 하루 수십 행 수준이라 따로 정리하지 않는다.

create table if not exists public.provider_alert (
  provider text not null,
  kind text not null,
  hour timestamptz not null,
  recovered_at timestamptz null,
  created_at timestamptz not null default now(),
  primary key (provider, kind, hour)
);

alter table public.provider_alert enable row level security;
revoke all on table public.provider_alert from anon, authenticated;
