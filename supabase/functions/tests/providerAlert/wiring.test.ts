import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// index.ts·createRecipe.ts는 URL import(Deno)라 Vitest로 못 불러 소스로 연결을 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('Gemini/Pixabay 호출부가 모두 장애 알림을 거친다', () => {
  it.each([
    'food-check',
    'generate-weekly-reports',
    'tag-recipes',
    'estimate-recipe-servings',
    'read-inbody',
  ])('%s: 함수 이름으로 알림 fetch를 만들어 Gemini 호출에 쓴다', (fn) => {
    const src = read(`../../${fn}/index.ts`);
    expect(flat(src)).toContain(
      `createProviderAlertFetch({ functionName: '${fn}', client: supabase, webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'), })`
    );
    expect(flat(src)).toMatch(/await providerFetch\( `https:\/\/generativelanguage/);
    expect(src).not.toMatch(/await fetch\(\s*`https:\/\/generativelanguage/);
  });

  it('레시피 생성: 텍스트·이미지 요청 모두 알림 fetch를 쓴다', () => {
    const src = read('../../_shared/createRecipe.ts');
    expect(src).toContain('requestRecipeText(command, geminiKey, providerFetch)');
    expect(src).toContain('requestRecipeImage(validated.recipeName, geminiKey, providerFetch)');
    expect(read('../../create-recipe-by-gemini/index.ts')).toContain(
      "serve(createRecipeHandler('create-recipe-by-gemini'));"
    );
    expect(read('../../create-recipe-by-gemini-test/index.ts')).toContain(
      "serve(createRecipeHandler('create-recipe-by-gemini-test'));"
    );
  });

  it('재료 요청: 판단·이미지 검색·검증·생성이 재시도 뒤 최종 응답을 알림에 넘긴다', () => {
    const src = flat(read('../../process-ingredient-request/index.ts'));
    expect(src).toContain(
      "createProviderAlertMonitor({ functionName: 'process-ingredient-request'"
    );
    expect(src).toContain(
      'judgeIngredient(record.name, existing, geminiKey, { onFinalResponse: providerMonitor.observe, })'
    );
    expect(src).toContain(
      "pixabayKey: requireEnv('PIXABAY_API_KEY'), onFinalResponse: providerMonitor.observe,"
    );
  });

  it('Gemini·Pixabay를 부르는 파일은 위에서 확인한 곳뿐이다', () => {
    // 새 호출부가 생기면 알림을 연결하고 이 목록에 더한다
    const root = new URL('../../', import.meta.url);
    const callers = (readdirSync(root, { recursive: true }) as string[])
      .filter((path) => path.endsWith('.ts') && !path.startsWith('tests'))
      .filter((path) =>
        /generativelanguage\.googleapis\.com|pixabay\.com\/api/.test(read(`../../${path}`))
      )
      .filter((path) => !path.endsWith('providerAlert.ts'))
      .sort();
    expect(callers).toEqual([
      '_shared/recipeImage.ts',
      '_shared/recipeText.ts',
      'estimate-recipe-servings/index.ts',
      'food-check/index.ts',
      'generate-weekly-reports/index.ts',
      'process-ingredient-request/image.ts',
      'process-ingredient-request/judge.ts',
      'read-inbody/index.ts',
      'tag-recipes/index.ts',
    ]);
  });
});

describe('20261030010000_provider_alert.sql', () => {
  const sql = flat(read('../../../migrations/20261030010000_provider_alert.sql'));

  it('(provider, model, kind, hour) 기본키 테이블, RLS 켜고 정책 없음 (service role 전용)', () => {
    expect(sql).toContain(
      "create table if not exists public.provider_alert ( provider text not null, model text not null default '', kind text not null, hour timestamptz not null, fail_count int not null default 0, alerted_at timestamptz null, recovered_at timestamptz null, created_at timestamptz not null default now(), primary key (provider, model, kind, hour) );"
    );
    expect(sql).toContain('alter table public.provider_alert enable row level security;');
    expect(sql).toContain('revoke all on table public.provider_alert from anon, authenticated;');
    expect(sql).not.toMatch(/create policy/i);
  });

  it('record_provider_failure는 service role만 실행한다', () => {
    expect(sql).toContain(
      'revoke all on function public.record_provider_failure(text, text, text, timestamptz, int) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.record_provider_failure(text, text, text, timestamptz, int) to service_role;'
    );
  });
});
