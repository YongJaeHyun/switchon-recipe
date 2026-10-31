import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 마이그레이션을 글자 단위로 확인한다 (로컬 DB 없이 돌리는 테스트)
const migration = () =>
  readFileSync(
    new URL('../../../migrations/20261101020000_recipe_by_name.sql', import.meta.url),
    'utf-8'
  )
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ');
const fnBody = (name: string) => {
  const sql = migration();
  const start = sql.indexOf(`create or replace function public.${name}`);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('20261101020000_recipe_by_name.sql', () => {
  it('user_trial에 무료 횟수 열 (0 이상)', () => {
    expect(migration()).toContain(
      'alter table public.user_trial add column if not exists recipe_by_name_used int not null default 0 check (recipe_by_name_used >= 0);'
    );
  });

  it('consume: public.user 행이 없으면(FK 위반) -1, 조건부 update 한 번으로 p_limit을 넘지 않는다', () => {
    const body = fnBody('consume_recipe_by_name_trial');
    expect(body).toMatch(
      /insert into public\.user_trial \(uid\) values \(p_uid\) on conflict \(uid\) do nothing; exception when foreign_key_violation then return -1; end;/
    );
    expect(body).toContain(
      'where uid = p_uid and recipe_by_name_used < p_limit returning recipe_by_name_used into v_used;'
    );
    expect(body).toContain('return greatest(p_limit - v_used, 0);');
  });

  it('release는 0 아래로 내려가지 않는다', () => {
    expect(fnBody('release_recipe_by_name_trial')).toContain(
      'set recipe_by_name_used = greatest(recipe_by_name_used - 1, 0)'
    );
  });

  it('체험 함수는 service role 전용', () => {
    const sql = migration();
    for (const sig of [
      'consume_recipe_by_name_trial(uuid, int)',
      'release_recipe_by_name_trial(uuid)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
  });

  it('이름 확인 하루 10번 설정 (이미 있으면 그대로)', () => {
    expect(migration()).toContain(
      "insert into public.premium_quota_setting (feature, daily) values ('recipe_name_check', 10) on conflict (feature) do nothing;"
    );
  });

  it('recipe.adapt_note 열과 앱이 읽는 뷰·RPC 세 곳에 맨 뒤 열로 추가', () => {
    const sql = migration();
    expect(sql).toContain('alter table public.recipe add column if not exists adapt_note text null;');
    expect(sql).toContain('r.servings, r.adapt_note FROM recipe r');
    expect(sql.match(/servings smallint, adapt_note text\)/g)).toHaveLength(2);
    expect(sql.match(/r\.servings, r\.adapt_note FROM filtered_recipes r/g)).toHaveLength(2);
    expect(sql).toContain(
      'grant execute on function public.search_recipes(integer, text, text, text) to public, anon, authenticated, service_role;'
    );
    expect(sql).toContain(
      'grant execute on function public.search_saved_recipes(integer, text, text) to public, anon, authenticated, service_role;'
    );
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });
});
