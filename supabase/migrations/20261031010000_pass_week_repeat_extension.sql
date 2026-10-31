-- 한 주 더 하기 때 스위치온 패스 7일 연장 (운영자 결정 2026-10-31: "스위치온 패스는 한 회차 전체를 책임지는 서비스")
--
-- (1) pass_extension: 연장 기록. (uid, 새 시작일)마다 한 번만, 그때 패스를 받치던 구매(purchase_token)에 묶는다.
--     상한은 구매당: 5주 패스 2번, 1주 패스 0번 (운영자 결정 2026-10-31). user.start_date·program_start는 본인이
--     아무 값으로나 바꿀 수 있는 열이라 상한의 근거로 쓰지 않는다.
--     엣지 함수(verify-pass-purchase, sync-voided-purchases)도 만료일을 다시 계산할 때 같은 규칙(_shared/pass.ts
--     computeExpiry)으로 연장을 쌓는다: 묶인 구매가 granted이고 상한 안이고 그 시각에 패스가 남아 있을 때만 +7일.
--     그래서 새 구매·환불 회수가 연장분을 지우지 않고, 묶인 구매가 환불되면 그 연장도 빠진다.
-- (2) extend_pass_for_week_repeat(p_new_start): 앱이 한 주 더 하기로 시작일을 저장한 직후 부른다.
--     실패하거나 null이어도 한 주 더 하기 자체에는 영향이 없다.
--
-- 배포 순서: 이 마이그레이션 → verify-pass-purchase, sync-voided-purchases 배포 → 앱.
-- (두 함수는 pass_extension을 읽으므로 테이블이 먼저 있어야 한다)

create table if not exists public.pass_extension (
  uid uuid not null references public.user (id) on delete cascade,
  new_start_date date not null,
  purchase_token text not null references public.pass_purchase (purchase_token) on delete cascade,
  extended_at timestamptz not null default now(),
  primary key (uid, new_start_date)
);

create index if not exists pass_extension_purchase_token_idx on public.pass_extension (purchase_token);

-- RLS 켜고 정책 없음: service role(엣지 함수)과 아래 security definer 함수만 접근한다
alter table public.pass_extension enable row level security;
revoke all on table public.pass_extension from public, anon, authenticated;

-- 새 만료일을 돌려준다. 다음 중 하나라도 아니면 아무것도 바꾸지 않고 null:
-- - p_new_start가 KST 오늘 - 35일 ~ 오늘 (미래 날짜 거절. 정상 흐름은 옛 시작일 + 7 <= 오늘)
-- - 활성 패스(pass_expires_at > now())가 있다 (무료 기간만으로는 늘리지 않는다)
-- - user.start_date가 이미 p_new_start로 저장돼 있고 program_start가 그보다 앞이다 (한 주 더 하기 뒤에 부른다.
--   본인이 바꿀 수 있는 열이라 정상 흐름 확인용일 뿐, 남용 방어는 아래 서버 기록이 한다)
-- - 마지막 연장 뒤 24시간이 지났다
-- - 지금 패스를 받치는 구매가 있고 그 구매의 연장 상한(5주 2번, 1주 0번)이 남았다
-- - 같은 (uid, p_new_start)로 늘린 적이 없다 (재시도·중복 호출)
--
-- 받치는 구매: granted 구매와 연장 기록을 시간 순으로 다시 쌓아(computeExpiry와 같은 규칙) 각 구매가 덮는 구간을
-- 만들고, 지금 시각이 들어가는 구간의 구매. 연장 7일은 묶인 구매 구간 끝에 붙고 그 뒤 구간은 7일씩 밀린다.
-- 상품 일수·상한은 _shared/pass.ts(passProductOf)와 같은 값: 1주 패스 7일·0번, 그 밖(5주 상품)은 35일·2번.
create or replace function public.extend_pass_for_week_repeat(p_new_start date)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_expires timestamptz;
  v_program_start date;
  r record;
  v_tokens text[] := '{}';
  v_max int[] := '{}';
  v_used int[] := '{}';
  v_starts timestamptz[] := '{}';
  v_ends timestamptz[] := '{}';
  v_n int := 0;
  v_expiry timestamptz;
  v_start timestamptz;
  v_backing int;
  i int;
  j int;
begin
  if v_uid is null or p_new_start is null then return null; end if;
  if p_new_start > v_today or p_new_start < v_today - 35 then return null; end if;

  -- 패스 행을 잠가 같은 유저의 동시 호출을 줄 세운다 (24시간·상한 검사와 +7일이 한 번에 하나씩)
  select pass_expires_at into v_expires
  from public.user_pass
  where uid = v_uid
  for update;
  if v_expires is null or v_expires <= now() then return null; end if;

  -- start_date가 date든 text든 앞 10자(yyyy-MM-dd)로 비교한다 (user_program_start 마이그레이션과 같은 방어)
  select program_start into v_program_start
  from public.user
  where id = v_uid
    and left(start_date::text, 10) = to_char(p_new_start, 'YYYY-MM-DD');
  if v_program_start is null or v_program_start >= p_new_start then return null; end if;

  if exists (
    select 1
    from public.pass_extension
    where uid = v_uid
      and extended_at > now() - interval '24 hours'
  ) then return null; end if;

  for r in
    select 0 as kind, p.purchase_token as token, p.product_id, p.purchased_at as ev_at
    from public.pass_purchase p
    where p.uid = v_uid
      and p.status = 'granted'
    union all
    select 1, e.purchase_token, null::text, e.extended_at
    from public.pass_extension e
    where e.uid = v_uid
    order by ev_at, kind
  loop
    if r.kind = 0 then
      v_start := case when v_expiry is not null and v_expiry > r.ev_at then v_expiry else r.ev_at end;
      v_n := v_n + 1;
      v_tokens[v_n] := r.token;
      v_max[v_n] := case when r.product_id = 'switchon_pass_1w_1500' then 0 else 2 end;
      v_used[v_n] := 0;
      v_starts[v_n] := v_start;
      v_ends[v_n] := v_start
        + case when r.product_id = 'switchon_pass_1w_1500' then interval '7 days' else interval '35 days' end;
      v_expiry := v_ends[v_n];
    else
      i := array_position(v_tokens, r.token);
      if i is null or v_used[i] >= v_max[i] or v_expiry is null or v_expiry <= r.ev_at then continue; end if;
      v_used[i] := v_used[i] + 1;
      v_ends[i] := v_ends[i] + interval '7 days';
      for j in i + 1 .. v_n loop
        v_starts[j] := v_starts[j] + interval '7 days';
        v_ends[j] := v_ends[j] + interval '7 days';
      end loop;
      v_expiry := v_expiry + interval '7 days';
    end if;
  end loop;

  for i in 1 .. v_n loop
    if v_starts[i] <= now() and now() < v_ends[i] then v_backing := i; end if;
  end loop;
  if v_backing is null then return null; end if;
  if v_used[v_backing] >= v_max[v_backing] then return null; end if;

  insert into public.pass_extension (uid, new_start_date, purchase_token)
  values (v_uid, p_new_start, v_tokens[v_backing])
  on conflict do nothing;
  if not found then return null; end if;

  update public.user_pass
  set pass_expires_at = pass_expires_at + interval '7 days',
      updated_at = now()
  where uid = v_uid
  returning pass_expires_at into v_expires;
  return v_expires;
end;
$$;

revoke all on function public.extend_pass_for_week_repeat(date) from public, anon, authenticated;
grant execute on function public.extend_pass_for_week_repeat(date) to authenticated;

-- PostgREST가 새 함수를 바로 보도록 스키마 캐시를 새로 읽게 한다
notify pgrst, 'reload schema';
