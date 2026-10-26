import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 마이그레이션·설정을 글자 단위로 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

const FUNCTION_URL =
  'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/refresh-ingredient-tags';

describe('20261026010000_refresh_tags_on_ingredient_change.sql', () => {
  const raw = read('../../../migrations/20261026010000_refresh_tags_on_ingredient_change.sql');
  const sql = flat(raw);
  const fn = 'public.refresh_ingredient_tags_on_ingredient_change()';

  it('Vault 시크릿이 없으면 마이그레이션을 멈춘다', () => {
    expect(sql).toContain(
      "if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then raise exception"
    );
  });

  it('트리거 함수는 security definer + 빈 search_path', () => {
    expect(sql).toMatch(
      /create or replace function public\.refresh_ingredient_tags_on_ingredient_change\(\) returns trigger language plpgsql security definer set search_path = ''/
    );
  });

  it('service role 키를 Vault에서 읽어 함수 URL로 net.http_post 한다', () => {
    expect(sql).toContain(
      "select decrypted_secret into service_key from vault.decrypted_secrets where name = 'service_role_key'"
    );
    expect(sql).toContain(`perform net.http_post( url := '${FUNCTION_URL}'`);
    expect(sql).toContain("'authorization', 'bearer ' || service_key");
  });

  it('INSERT/UPDATE/DELETE마다 전이 테이블을 쓰는 문장 단위 AFTER 트리거', () => {
    expect(sql).toContain(
      `after insert on public.ingredient referencing new table as new_rows for each statement execute function ${fn};`
    );
    expect(sql).toContain(
      `after update on public.ingredient referencing old table as old_rows new table as new_rows for each statement execute function ${fn};`
    );
    expect(sql).toContain(
      `after delete on public.ingredient referencing old table as old_rows for each statement execute function ${fn};`
    );
    expect(sql).not.toContain('for each row');
    expect(sql).not.toMatch(/create trigger [^;]* when /);
  });

  it('UPDATE는 name/sub_keywords/is_active가 바뀐 활성 재료가 있을 때만 호출한다', () => {
    expect(sql).toContain('from new_rows n full join old_rows o on o.id = n.id');
    expect(sql).toContain('n.name is distinct from o.name');
    expect(sql).toContain('n.sub_keywords is distinct from o.sub_keywords');
    expect(sql).toContain('n.is_active is distinct from o.is_active');
    expect(sql).toContain('if not relevant then return null; end if;');
  });

  it('INSERT/DELETE는 활성 재료가 있을 때만', () => {
    expect(sql).toContain('select 1 from new_rows where is_active');
    expect(sql).toContain('select 1 from old_rows where is_active');
  });

  it('호출 실패가 재료 편집을 막지 않는다 (경고만)', () => {
    expect(sql).toMatch(/exception when others then raise warning/);
  });

  it('트리거 함수 실행 권한을 public/anon/authenticated에서 회수한다', () => {
    expect(sql).toContain(`revoke all on function ${fn} from public, anon, authenticated;`);
    expect(sql).toContain(`alter function ${fn} owner to postgres;`);
  });

  it('매일 19:50 UTC(04:50 KST) 안전망 cron으로 전체 갱신을 호출한다', () => {
    expect(sql).toContain("select cron.schedule( 'refresh-ingredient-tags', '50 19 * * *',");
    expect(sql.split(FUNCTION_URL).length - 1).toBe(2);
  });

  it('다시 적용해도 되게 트리거를 먼저 지운다', () => {
    for (const t of [
      'ingredient_refresh_tags_ins',
      'ingredient_refresh_tags_upd',
      'ingredient_refresh_tags_del',
    ]) {
      expect(sql).toContain(`drop trigger if exists ${t} on public.ingredient;`);
    }
  });
});

describe('refresh-ingredient-tags 함수 설정', () => {
  it('config.toml: sync-voided-purchases처럼 verify_jwt = true', () => {
    const toml = read('../../../config.toml');
    expect(toml).toContain(
      [
        '[functions.refresh-ingredient-tags]',
        'enabled = true',
        'verify_jwt = true',
        'import_map = "./functions/refresh-ingredient-tags/deno.json"',
        'entrypoint = "./functions/refresh-ingredient-tags/index.ts"',
      ].join('\n')
    );
  });

  it('index.ts는 handler에 연결하고 ingredient(is_active)를 읽는다', () => {
    const src = flat(read('../../refresh-ingredient-tags/index.ts'));
    expect(src).toContain('serve((req: request) => handlerefreshingredienttags(req, deps))');
    expect(src).toContain(
      ".from('ingredient') .select('name, sub_keywords') .eq('is_active', true)"
    );
    expect(src).toMatch(/\.update\(\{ ingredient_tags: tags \}\) ?\.eq\('id', id\)/);
  });

  it('일회성 백필 스크립트는 함수로 대체되어 없다', () => {
    expect(
      existsSync(new URL('../../../../scripts/backfillIngredientTags.ts', import.meta.url))
    ).toBe(false);
  });
});
