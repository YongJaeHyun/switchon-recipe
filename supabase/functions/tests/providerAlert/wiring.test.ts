import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// index.ts·createRecipe.ts는 URL import(Deno)라 Vitest로 못 불러 소스로 연결을 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('Gemini/Pixabay 호출부가 모두 장애 알림을 거친다', () => {
  it.each(['food-check', 'tag-recipes', 'estimate-recipe-servings', 'read-inbody'])(
    '%s: 함수 이름으로 알림 fetch를 만들어 Gemini 호출에 쓴다',
    (fn) => {
      const src = read(`../../${fn}/index.ts`);
      expect(flat(src)).toContain(
        `createProviderAlertFetch({ functionName: '${fn}', client: supabase, webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'), })`
      );
      expect(flat(src)).toMatch(/await providerFetch\( `https:\/\/generativelanguage/);
      expect(src).not.toMatch(/await fetch\(\s*`https:\/\/generativelanguage/);
    }
  );

  it('레시피 생성: 텍스트·이미지 요청 모두 알림 fetch를 쓴다', () => {
    const src = read('../../_shared/createRecipe.ts');
    // 알림 fetch(providerFetch)를 사용량 기록(aiUsageFetch)으로 한 번 더 감싸 쓴다
    expect(flat(src)).toContain('aiUsageFetch(providerFetch, adminClient, { feature, uid })');
    expect(src).toContain("requestRecipeText(command, geminiKey, usageFetch('recipe_text'))");
    expect(flat(src)).toContain(
      "requestRecipeImage( validated.recipeName, geminiKey, usageFetch('recipe_image') )"
    );
    expect(read('../../create-recipe-by-gemini/index.ts')).toContain(
      "serve(createRecipeHandler('create-recipe-by-gemini'));"
    );
    expect(read('../../create-recipe-by-gemini-test/index.ts')).toContain(
      "serve(createRecipeHandler('create-recipe-by-gemini-test'));"
    );
  });

  it('음식 이름으로 만들기: 이름 판정·레시피 생성·이미지 모두 알림 fetch를 쓴다', () => {
    const src = flat(read('../../create-recipe-by-name/index.ts'));
    expect(src).toContain(
      "createProviderAlertFetch({ functionName: 'create-recipe-by-name', client: supabase, webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'), })"
    );
    expect(src).toContain(
      "requestNameCheck( prompt, requireEnv('GEMINI_API_KEY'), aiUsageFetch(providerFetch, supabase, { feature: 'recipe_name_check', uid }) )"
    );
    expect(src).toContain('generateAndSaveRecipe(createRecipeClients(req), providerFetch, {');
    // 판정 요청은 넘겨받은 fetch만 쓴다
    const check = flat(read('../../create-recipe-by-name/nameCheck.ts'));
    expect(check).toMatch(/await fetchFn\( `https:\/\/generativelanguage/);
    expect(check).not.toMatch(/await fetch\(/);
  });

  it('재료 요청: 판단·이미지 검색·검증·생성이 재시도 뒤 최종 응답을 알림에 넘긴다', () => {
    const src = flat(read('../../process-ingredient-request/index.ts'));
    expect(src).toContain(
      "createProviderAlertMonitor({ functionName: 'process-ingredient-request'"
    );
    // 최종 응답은 장애 알림과 사용량 기록에 같이 넘긴다
    expect(src).toContain('providerMonitor.observe(url, res); observeUsage(url, res);');
    expect(src).toContain(
      "judgeIngredient(record.name, existing, geminiKey, { onFinalResponse: finalResponseObserver('ingredient_judge', record.uid ?? null), })"
    );
    expect(src).toContain(
      "pixabayKey: requireEnv('PIXABAY_API_KEY'), // 사진 검증(gemini-2.5-flash)과 이미지 생성(이미지 모델)이 같은 콜백을 쓰므로 모델로 나눈다 onFinalResponse: finalResponseObserver("
    );
  });

  it('주간 리포트(cron·패스 구매 뒤 보충·직접 만들기): 공용 구현이 함수 이름으로 알림 fetch를 만들어 Gemini 호출에 쓴다', () => {
    const src = read('../../_shared/weeklyReportDb.ts');
    expect(flat(src)).toContain(
      "createProviderAlertFetch({ functionName, client: supabase, webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'), })"
    );
    expect(flat(src)).toMatch(/await providerFetch\( `https:\/\/generativelanguage/);
    expect(src).not.toMatch(/await fetch\(\s*`https:\/\/generativelanguage/);
    for (const fn of ['generate-weekly-reports', 'verify-pass-purchase', 'generate-my-report']) {
      expect(read(`../../${fn}/index.ts`)).toContain(`createWeeklyReportDeps(supabase, '${fn}')`);
    }
  });

  it.each([
    ['tag-recipes/index.ts', "{ feature: 'recipe_tags' }"],
    ['estimate-recipe-servings/index.ts', "{ feature: 'recipe_servings' }"],
    ['food-check/index.ts', "aiUsageFetch(alertFetch, supabase, { feature: 'food_check', uid })"],
    ['read-inbody/index.ts', "aiUsageFetch(alertFetch, supabase, { feature: 'inbody_read', uid })"],
    [
      '_shared/weeklyReportDb.ts',
      "aiUsageFetch(alertFetch, supabase, { feature: functionName === 'generate-my-report' ? 'report_on_demand' : 'weekly_report', uid: uid ?? null, })",
    ],
  ])('%s: Gemini 호출마다 사용량을 기능 이름으로 남긴다 (ai_usage)', (path, wiring) => {
    expect(flat(read(`../../${path}`))).toContain(wiring);
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
      '_shared/weeklyReportDb.ts',
      'create-recipe-by-name/nameCheck.ts',
      'estimate-recipe-servings/index.ts',
      'food-check/index.ts',
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
