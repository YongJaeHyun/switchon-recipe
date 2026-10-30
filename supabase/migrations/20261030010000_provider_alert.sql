-- 외부 AI·이미지 API(Gemini, Pixabay) 장애 Slack 알림의 실패 횟수·중복 방지 기록 (_shared/providerAlert.ts).
-- 엣지 함수가 실패를 감지하면 record_provider_failure로 (provider, model, kind, hour) 행의 fail_count를 올리고,
-- 횟수가 기준(billing·auth·model 1번, outage 3번) 이상이고 아직 아무도 알리지 않았으면 alerted_at을 채워 "차지한"
-- 요청만 Slack에 보낸다. 그래서 실패가 쏟아져도 같은 provider·모델·유형 알림은 1시간에 한 번이다.
-- recovered_at: billing·auth 알림 뒤 24시간 안에 같은 모델 호출이 다시 성공하면 채우고 "복구됨"을 한 번 보낸다.
-- 복구 뒤 같은 시간에 다시 실패하면 recovered_at·alerted_at을 비우고 횟수를 새로 세어 다시 알린다.
-- model: Gemini 모델 이름(텍스트·이미지 모델을 따로 센다), Pixabay는 빈 문자열.
--
-- 권한: RLS를 켜고 정책을 두지 않아 service role(엣지 함수)만 읽고 쓴다. 함수도 service role만 실행한다.
-- 행은 provider·모델·유형·시간당 최대 1개라 장애가 계속돼도 하루 수십 행 수준이라 따로 정리하지 않는다.

create table if not exists public.provider_alert (
  provider text not null,
  model text not null default '',
  kind text not null,
  hour timestamptz not null,
  fail_count int not null default 0,
  alerted_at timestamptz null,
  recovered_at timestamptz null,
  created_at timestamptz not null default now(),
  primary key (provider, model, kind, hour)
);

alter table public.provider_alert enable row level security;
revoke all on table public.provider_alert from anon, authenticated;

-- 실패 한 번을 세고, 이 호출이 알림을 보내야 하면 차지하고 true를 돌려준다.
-- upsert가 행 잠금을 잡은 채 이어서 alerted_at을 채우므로 동시에 여러 요청이 와도 한 요청만 true를 받는다.
create or replace function public.record_provider_failure(
  p_provider text,
  p_model text,
  p_kind text,
  p_hour timestamptz,
  p_threshold int
) returns boolean
language plpgsql
set search_path = public
as $$
begin
  insert into public.provider_alert as a (provider, model, kind, hour, fail_count)
  values (p_provider, p_model, p_kind, p_hour, 1)
  on conflict (provider, model, kind, hour) do update set
    -- 복구 처리된 행이면 다시 차지할 수 있게 비우고 횟수를 새로 센다
    fail_count = case when a.recovered_at is null then a.fail_count + 1 else 1 end,
    alerted_at = case when a.recovered_at is null then a.alerted_at else null end,
    recovered_at = null;

  update public.provider_alert as a
     set alerted_at = now()
   where a.provider = p_provider
     and a.model = p_model
     and a.kind = p_kind
     and a.hour = p_hour
     and a.alerted_at is null
     and a.fail_count >= p_threshold;

  return found;
end;
$$;

revoke all on function public.record_provider_failure(text, text, text, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.record_provider_failure(text, text, text, timestamptz, int)
  to service_role;
