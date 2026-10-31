import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 한 주 더 하기 패스 연장 마이그레이션과 엣지 함수 연결을 글자 단위로 확인한다
// (로컬 DB 없이 돌리는 테스트라 SQL 동작 자체는 db push 전 dry-run으로 본다)
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const migration = () =>
  read('../../../migrations/20261031010000_pass_week_repeat_extension.sql')
    // 주석은 빼고 본다 (주석의 설명 문장이 검사에 걸리지 않게)
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ');
const fnBody = () => {
  const sql = migration();
  const start = sql.indexOf('create or replace function public.extend_pass_for_week_repeat');
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('pass_extension 테이블', () => {
  it('(uid, new_start_date) 기본키, 연장을 받친 구매(purchase_token)에 묶인다, extended_at 기본값 now()', () => {
    expect(migration()).toMatch(
      /create table if not exists public\.pass_extension \( uid uuid not null references public\.user \(id\) on delete cascade, new_start_date date not null, purchase_token text not null references public\.pass_purchase \(purchase_token\) on delete cascade, extended_at timestamptz not null default now\(\), primary key \(uid, new_start_date\) \);/
    );
    expect(migration()).toContain(
      'create index if not exists pass_extension_purchase_token_idx on public.pass_extension (purchase_token);'
    );
  });

  it('RLS 켜고 정책 없음, anon/authenticated 권한 회수 (service role·definer 함수만)', () => {
    const sql = migration();
    expect(sql).toContain('alter table public.pass_extension enable row level security;');
    expect(sql).not.toMatch(/create policy[^;]*on public\.pass_extension/);
    expect(sql).toContain(
      'revoke all on table public.pass_extension from public, anon, authenticated;'
    );
  });
});

describe('extend_pass_for_week_repeat(p_new_start date)', () => {
  it('security definer, search_path 고정, 새 만료일(timestamptz)을 돌려준다', () => {
    expect(fnBody()).toMatch(
      /create or replace function public\.extend_pass_for_week_repeat\(p_new_start date\) returns timestamptz language plpgsql volatile security definer set search_path = public/
    );
  });

  it('호출자는 auth.uid()뿐 (uid 인자를 받지 않음)', () => {
    const body = fnBody();
    expect(body).toContain('v_uid uuid := auth.uid();');
    expect(body).toMatch(/if v_uid is null or p_new_start is null then return null; end if;/);
  });

  it('(b) 새 시작일은 KST 오늘 - 35일 ~ 오늘 (미래 날짜 거절)', () => {
    const body = fnBody();
    expect(body).toContain("v_today date := (now() at time zone 'Asia/Seoul')::date;");
    expect(body).toMatch(
      /if p_new_start > v_today or p_new_start < v_today - 35 then return null; end if;/
    );
  });

  it('활성 패스(pass_expires_at > now())만, 패스 행을 잠그고 본다', () => {
    const body = fnBody();
    expect(body).toMatch(
      /select pass_expires_at into v_expires from public\.user_pass where uid = v_uid for update;/
    );
    expect(body).toMatch(/if v_expires is null or v_expires <= now\(\) then return null; end if;/);
  });

  it('시작일이 p_new_start로 저장돼 있고 회차 시작일이 그보다 앞일 때만', () => {
    const body = fnBody();
    expect(body).toMatch(
      /select program_start into v_program_start from public\.user where id = v_uid and left\(start_date::text, 10\) = to_char\(p_new_start, 'YYYY-MM-DD'\);/
    );
    expect(body).toMatch(
      /if v_program_start is null or v_program_start >= p_new_start then return null; end if;/
    );
  });

  it('(c) 마지막 연장 뒤 24시간 안에는 다시 늘리지 않는다', () => {
    expect(fnBody()).toMatch(
      /if exists \( select 1 from public\.pass_extension where uid = v_uid and extended_at > now\(\) - interval '24 hours' \) then return null; end if;/
    );
  });

  it('(a) granted 구매와 연장을 시간 순으로 다시 쌓아 지금 패스를 받치는 구매를 찾는다 (computeExpiry와 같은 규칙)', () => {
    const body = fnBody();
    expect(body).toMatch(
      /from public\.pass_purchase p where p\.uid = v_uid and p\.status = 'granted' union all select 1, e\.purchase_token, null::text, e\.extended_at from public\.pass_extension e where e\.uid = v_uid order by ev_at, kind/
    );
    // 상품별 일수·연장 상한: 1주 7일·0번, 그 밖(5주)은 35일·2번
    expect(body).toMatch(
      /v_max\[v_n\] := case when r\.product_id = 'switchon_pass_1w_1500' then 0 else 2 end;/
    );
    expect(body).toMatch(
      /case when r\.product_id = 'switchon_pass_1w_1500' then interval '7 days' else interval '35 days' end/
    );
    // 연장은 묶인 구매가 있고, 상한이 남고, 그 시각에 패스가 남아 있을 때만
    expect(body).toMatch(
      /if i is null or v_used\[i\] >= v_max\[i\] or v_expiry is null or v_expiry <= r\.ev_at then continue; end if;/
    );
    expect(body).toMatch(
      /if v_starts\[i\] <= now\(\) and now\(\) < v_ends\[i\] then v_backing := i; end if;/
    );
    expect(body).toMatch(/if v_backing is null then return null; end if;/);
    expect(body).toMatch(/if v_used\[v_backing\] >= v_max\[v_backing\] then return null; end if;/);
  });

  it('같은 (uid, 새 시작일)은 한 번만: 받치는 구매에 묶어 기록을 먼저 넣고, 이미 있으면 늘리지 않는다', () => {
    expect(fnBody()).toMatch(
      /insert into public\.pass_extension \(uid, new_start_date, purchase_token\) values \(v_uid, p_new_start, v_tokens\[v_backing\]\) on conflict do nothing; if not found then return null; end if;/
    );
  });

  it('만료일 +7일 후 새 만료일을 돌려준다, 검사 순서', () => {
    const body = fnBody();
    expect(body).toMatch(
      /update public\.user_pass set pass_expires_at = pass_expires_at \+ interval '7 days', updated_at = now\(\) where uid = v_uid returning pass_expires_at into v_expires; return v_expires;/
    );
    const order = [
      'p_new_start > v_today',
      'from public.user_pass where uid = v_uid for update',
      'from public.user where id = v_uid',
      "interval '24 hours'",
      'from public.pass_purchase p',
      'if v_backing is null',
      'insert into public.pass_extension',
      'update public.user_pass',
    ].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('회차(program_start) 기준 상한은 쓰지 않는다 (클라이언트가 바꿀 수 있는 열)', () => {
    expect(fnBody()).not.toMatch(/new_start_date > v_program_start/);
  });

  it('실행 권한은 authenticated에만', () => {
    const sql = migration();
    expect(sql).toContain(
      'revoke all on function public.extend_pass_for_week_repeat(date) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.extend_pass_for_week_repeat(date) to authenticated;'
    );
    expect(sql).not.toMatch(/grant [^;]*extend_pass_for_week_repeat[^;]* to [^;]*anon/);
  });
});

describe('엣지 함수가 연장 기록을 만료일 계산에 넣는다', () => {
  it.each(['../../verify-pass-purchase/index.ts', '../../sync-voided-purchases/index.ts'])(
    '%s: pass_extension의 extended_at, purchase_token과 구매의 purchase_token을 읽는다',
    (path) => {
      const src = read(path);
      expect(src).toMatch(
        /\.from\('pass_extension'\)\s*\.select\('extended_at, purchase_token'\)\s*\.eq\('uid', uid\)/
      );
      expect(src).toContain(".select('purchase_token, product_id, purchased_at, status')");
    }
  );
});
