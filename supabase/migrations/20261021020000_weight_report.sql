-- 체중·할 일·단식 일별 기록 + 주간 리포트 + 사용자 설정
-- day는 KST 기준 날짜 (클라이언트가 계산해서 저장)

create table public.weight_log (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  weight_kg numeric(4, 1) not null check (weight_kg >= 20.0 and weight_kg <= 300.0),
  updated_at timestamptz not null default now(),
  primary key (uid, day)
);

create table public.todo_daily (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  items text[] not null,
  checked integer[] not null,
  updated_at timestamptz not null default now(),
  primary key (uid, day)
);

create table public.fasting_result (
  uid uuid not null references public.user (id) on delete cascade,
  day date not null,
  result text not null check (result in ('success', 'broken')),
  updated_at timestamptz not null default now(),
  primary key (uid, day)
);

create table public.user_setting (
  uid uuid primary key references public.user (id) on delete cascade,
  weight_reminder boolean not null default false,
  weight_reminder_asked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- AI 주간 리포트 (edge function이 service role로 기록)
create table public.weekly_report (
  uid uuid not null references public.user (id) on delete cascade,
  start_date date not null,
  week_index integer not null,
  stats jsonb not null,
  content jsonb,
  status text not null default 'ready' check (status in ('ready', 'empty')),
  created_at timestamptz not null default now(),
  primary key (uid, start_date, week_index)
);

alter table public.weight_log enable row level security;
alter table public.todo_daily enable row level security;
alter table public.fasting_result enable row level security;
alter table public.user_setting enable row level security;
alter table public.weekly_report enable row level security;

create policy "체중 기록은 본인만 조회"
  on public.weight_log for select
  to authenticated
  using (uid = auth.uid());

create policy "체중 기록은 본인만 추가"
  on public.weight_log for insert
  to authenticated
  with check (uid = auth.uid());

create policy "체중 기록은 본인만 수정"
  on public.weight_log for update
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

create policy "체중 기록은 본인만 삭제"
  on public.weight_log for delete
  to authenticated
  using (uid = auth.uid());

create policy "일별 할 일은 본인만 조회"
  on public.todo_daily for select
  to authenticated
  using (uid = auth.uid());

create policy "일별 할 일은 본인만 추가"
  on public.todo_daily for insert
  to authenticated
  with check (uid = auth.uid());

create policy "일별 할 일은 본인만 수정"
  on public.todo_daily for update
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- todo_daily delete 정책 없음

create policy "단식 결과는 본인만 전체 접근"
  on public.fasting_result for all
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

create policy "사용자 설정은 본인만 전체 접근"
  on public.user_setting for all
  to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

create policy "주간 리포트는 본인만 조회"
  on public.weekly_report for select
  to authenticated
  using (uid = auth.uid());

-- weekly_report insert/update/delete 정책 없음 (edge function이 service role로 기록)
