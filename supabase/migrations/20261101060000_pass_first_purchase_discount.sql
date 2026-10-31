-- 5주 패스 첫 구매 할인(2,900원)은 한 번만 (운영자 결정 2026-11-01).
-- verify-pass-purchase가 구매를 granted로 기록할 때 이 함수를 쓴다. 유저별 advisory lock을 잡은 한 트랜잭션에서
-- "이미 granted인 5주 패스가 있는지" 확인과 기록을 함께 해, 거의 동시에 검증된 할인 구매 둘이 모두 지급되지 않게 한다.
-- 먼저 검증된 구매가 할인을 갖고, 나중에 검증된 할인 구매는 기록하지 않고 'discount_used'를 돌려준다
-- (엣지 함수가 환불하고 refunded_ineligible로 기록한다). 이미 지급한 구매는 나중에 되돌리지 않는다.
-- 반환: 'inserted' | 'duplicate'(같은 구매 토큰이 이미 있음) | 'discount_used'

create or replace function public.grant_pass_purchase(
  p_uid uuid,
  p_product_id text,
  p_purchase_token text,
  p_order_id text,
  p_price_krw integer,
  p_purchased_at timestamptz,
  p_granted_from timestamptz,
  p_granted_until timestamptz,
  p_raw jsonb,
  p_check_first_purchase_discount boolean
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- 같은 유저의 패스 지급을 한 줄로 세운다 (트랜잭션이 끝나면 풀림)
  perform pg_advisory_xact_lock(hashtextextended('grant_pass_purchase:' || p_uid::text, 0));

  if exists (select 1 from public.pass_purchase where purchase_token = p_purchase_token) then
    return 'duplicate';
  end if;

  -- 환불(voided)되거나 서버가 돌려준(refunded_ineligible) 구매는 할인을 쓴 것으로 보지 않는다
  if p_check_first_purchase_discount and exists (
    select 1
    from public.pass_purchase
    where uid = p_uid
      and status = 'granted'
      and product_id like 'switchon\_pass\_5w\_%'
  ) then
    return 'discount_used';
  end if;

  insert into public.pass_purchase (
    uid, product_id, purchase_token, order_id, price_krw, purchased_at,
    granted_from, granted_until, status, raw
  )
  values (
    p_uid, p_product_id, p_purchase_token, p_order_id, p_price_krw, p_purchased_at,
    p_granted_from, p_granted_until, 'granted', p_raw
  );
  return 'inserted';
exception
  -- lock 밖(다른 경로)에서 같은 토큰이 먼저 들어간 경우
  when unique_violation then
    return 'duplicate';
end;
$$;

revoke all on function public.grant_pass_purchase(
  uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz, jsonb, boolean
) from public, anon, authenticated;

-- 기본 권한에 기대지 않고 verify-pass-purchase(service_role)가 부를 수 있게 명시한다
grant execute on function public.grant_pass_purchase(
  uuid, text, text, text, integer, timestamptz, timestamptz, timestamptz, jsonb, boolean
) to service_role;
