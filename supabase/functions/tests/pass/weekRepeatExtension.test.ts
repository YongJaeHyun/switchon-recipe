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
  it('(uid, new_start_date) 기본키, extended_at 기본값 now()', () => {
    expect(migration()).toMatch(
      /create table if not exists public\.pass_extension \( uid uuid not null references public\.user \(id\) on delete cascade, new_start_date date not null, extended_at timestamptz not null default now\(\), primary key \(uid, new_start_date\) \);/
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

  it('활성 패스(pass_expires_at > now())만, 패스 행을 잠그고 본다', () => {
    const body = fnBody();
    expect(body).toMatch(
      /select pass_expires_at into v_expires from public\.user_pass where uid = v_uid for update;/
    );
    expect(body).toMatch(/if v_expires is null or v_expires <= now\(\) then return null; end if;/);
  });

  it('시작일이 p_new_start로 저장돼 있고 회차 시작일이 그보다 앞일 때만 (한 주 더, 다시 시작 아님)', () => {
    const body = fnBody();
    expect(body).toMatch(
      /select program_start into v_program_start from public\.user where id = v_uid and left\(start_date::text, 10\) = to_char\(p_new_start, 'YYYY-MM-DD'\);/
    );
    expect(body).toMatch(
      /if v_program_start is null or v_program_start >= p_new_start then return null; end if;/
    );
  });

  it('이번 회차 연장은 4번까지', () => {
    const body = fnBody();
    expect(body).toMatch(
      /select count\(\*\) into v_count from public\.pass_extension where uid = v_uid and new_start_date > v_program_start;/
    );
    expect(body).toMatch(/if v_count >= 4 then return null; end if;/);
  });

  it('같은 (uid, 새 시작일)은 한 번만: 기록을 먼저 넣고, 이미 있으면 늘리지 않는다', () => {
    const body = fnBody();
    expect(body).toMatch(
      /insert into public\.pass_extension \(uid, new_start_date\) values \(v_uid, p_new_start\) on conflict do nothing; if not found then return null; end if;/
    );
  });

  it('만료일 +7일 후 새 만료일을 돌려준다', () => {
    const body = fnBody();
    expect(body).toMatch(
      /update public\.user_pass set pass_expires_at = pass_expires_at \+ interval '7 days', updated_at = now\(\) where uid = v_uid returning pass_expires_at into v_expires; return v_expires;/
    );
    // 검사 순서: 패스 → 시작일 → 횟수 → 기록 → 연장
    const order = [
      'from public.user_pass where uid = v_uid for update',
      'from public.user where id = v_uid',
      'select count(*) into v_count',
      'insert into public.pass_extension',
      'update public.user_pass',
    ].map((s) => body.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
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
    '%s: pass_extension.extended_at을 읽는다',
    (path) => {
      const src = read(path);
      expect(src).toMatch(
        /\.from\('pass_extension'\)\s*\.select\('extended_at'\)\s*\.eq\('uid', uid\)/
      );
    }
  );
});
