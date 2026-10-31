import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 무료 체험 마이그레이션을 글자 단위로 확인한다
// (로컬 DB 없이 돌리는 테스트라 SQL 동작 자체는 db push 전 dry-run으로 본다)
const migration = () =>
  readFileSync(
    new URL('../../../migrations/20261031020000_user_trial.sql', import.meta.url),
    'utf-8'
  )
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ');
const fnBody = (name: string) => {
  const sql = migration();
  const start = sql.indexOf(`create or replace function public.${name}`);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('consume_food_check_trial', () => {
  it('public.user 행이 없는 사용자(FK 위반)는 500 대신 -1 (다 쓴 것처럼 402)', () => {
    expect(fnBody('consume_food_check_trial')).toMatch(
      /insert into public\.user_trial \(uid\) values \(p_uid\) on conflict \(uid\) do nothing; exception when foreign_key_violation then return -1; end;/
    );
  });

  it('조건부 update 한 번으로 늘린다 (p_limit을 넘지 않음)', () => {
    expect(fnBody('consume_food_check_trial')).toContain(
      'where uid = p_uid and food_check_used < p_limit returning food_check_used into v_used;'
    );
  });

  it('service role 전용', () => {
    const sql = migration();
    expect(sql).toContain(
      'revoke all on function public.consume_food_check_trial(uuid, int) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.consume_food_check_trial(uuid, int) to service_role;'
    );
  });
});
