import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PASS_RECIPE_CAP_SETTING } from '../../_shared/passRecipeCap.ts';

// 아직 원격에 적용하지 않은 마이그레이션을 글자 단위로 확인한다 (SQL 동작은 db push 전 dry-run으로 본다)
const sql = readFileSync(
  new URL('../../../migrations/20261101050000_pass_recipe_cap_and_ai_usage.sql', import.meta.url),
  'utf-8'
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ');

describe('20261101050000_pass_recipe_cap_and_ai_usage.sql', () => {
  it('총량 설정 기본값이 TS 사본(passRecipeCap.ts)과 같다', () => {
    expect(sql).toContain(
      `add column if not exists pass_recipe_total integer not null default ${DEFAULT_PASS_RECIPE_CAP_SETTING.fiveWeekTotal}`
    );
    expect(sql).toContain(
      `add column if not exists pass_recipe_per_week integer not null default ${DEFAULT_PASS_RECIPE_CAP_SETTING.perWeek}`
    );
  });

  it('총량 판단은 오늘 행을 잠근 뒤 센다 (동시 요청)', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.consume_recipe_quota'));
    expect(body.indexOf('for update;')).toBeLessThan(
      body.indexOf('select * into v_pass from public.pass_recipe_cap_state(p_uid);')
    );
  });

  it('5.x 호환: 기존 응답 키를 그대로 둔다', () => {
    const consume = sql.slice(
      sql.indexOf('create or replace function public.consume_recipe_quota'),
      sql.indexOf('create or replace function public.grant_ad_bonus')
    );
    for (const key of ['allowed', 'remaining', 'limit', 'isPass', 'canWatchAd']) {
      expect(consume).toContain(`'${key}',`);
    }
    const get = sql.slice(sql.indexOf('create or replace function public.get_recipe_quota'));
    for (const key of ['used', 'limit', 'remaining', 'adBonusLeft', 'isPass', 'dailyLimit']) {
      expect(get).toContain(`'${key}',`);
    }
    expect(sql).toContain('grant execute on function public.get_recipe_quota() to authenticated;');
  });

  it('새 함수는 service role 전용', () => {
    for (const fn of [
      'pass_recipe_period(uuid, integer, integer)',
      'pass_recipe_cap_state(uuid)',
      'ai_usage_cost(date, date, numeric)',
    ]) {
      expect(sql).toContain(
        `revoke all on function public.${fn} from public, anon, authenticated;`
      );
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });

  it('ai_usage: RLS 켜고 정책 없음, anon/authenticated 권한 회수', () => {
    expect(sql).toContain('create table if not exists public.ai_usage (');
    expect(sql).toContain('alter table public.ai_usage enable row level security;');
    expect(sql).toContain('revoke all on table public.ai_usage from public, anon, authenticated;');
    expect(sql).not.toMatch(/create policy/i);
  });
});
