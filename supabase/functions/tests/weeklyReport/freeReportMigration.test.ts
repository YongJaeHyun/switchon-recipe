import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 무료 1주차 리포트 SQL (아직 원격에 적용하지 않은 20261031020000_user_trial.sql)을 글자 단위로 확인한다
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
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('무료 1주차 리포트 마이그레이션', () => {
  it('weekly_report.is_trial (기본 false, 옛 행·옛 함수는 보통 리포트)', () => {
    expect(migration()).toContain(
      'alter table public.weekly_report add column if not exists is_trial boolean not null default false;'
    );
  });

  it('claim_free_report: 비어 있을 때만 조건부 update 한 번으로 채우고 그 결과를 돌려준다', () => {
    const body = fnBody('claim_free_report');
    expect(body).toContain('returns boolean');
    expect(body).toMatch(
      /insert into public\.user_trial \(uid\) values \(p_uid\) on conflict \(uid\) do nothing; exception when foreign_key_violation then return false; end;/
    );
    expect(body).toContain('where uid = p_uid and free_report_at is null; return found;');
  });

  it('release_free_report: free_report_at을 비운다', () => {
    expect(fnBody('release_free_report')).toContain('set free_report_at = null');
  });

  it('두 함수 모두 service role 전용', () => {
    const sql = migration();
    for (const fn of ['claim_free_report', 'release_free_report']) {
      expect(sql).toContain(
        `revoke all on function public.${fn}(uuid) from public, anon, authenticated;`
      );
      expect(sql).toContain(`grant execute on function public.${fn}(uuid) to service_role;`);
    }
  });
});
