import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// index.ts는 URL import(Deno)라 Vitest로 못 불러 소스로 연결을 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('generate-my-report 연결', () => {
  const src = flat(read('../../generate-my-report/index.ts'));

  it('유저 JWT로 uid를 구하고 DB는 service role 클라이언트로만, 공용 리포트 구현을 쓴다', () => {
    expect(src).toContain(
      "createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))"
    );
    expect(src).toContain("createWeeklyReportDeps(supabase, 'generate-my-report')");
    expect(src).toContain('getUid,');
    expect(src).toContain('serve((req: Request) => handleGenerateMyReport(req, deps));');
  });

  it('기록이 바뀌었는지는 네 테이블의 updated_at으로 본다 (그 주 day 범위, 단식 계획은 키)', () => {
    for (const table of ['weight_log', 'todo_daily', 'fasting_result']) {
      expect(src).toContain(
        `.from('${table}') .select('day') .eq('uid', uid) .gte('day', range.from) .lte('day', range.to) .gt('updated_at', since) .lte('updated_at', now) .limit(1)`
      );
    }
    expect(src).toContain(
      ".from('fasting_plan') .select('week_index') .eq('uid', uid) .eq('start_date', startDate) .eq('week_index', weekIndex) .gt('updated_at', since) .lte('updated_at', now) .limit(1)"
    );
  });

  it('하루 1번은 regenerated_at 조건부 update로 차지한다', () => {
    expect(src).toContain(
      ".update({ regenerated_at: at }) .eq('uid', uid) .eq('start_date', startDate) .eq('week_index', weekIndex) .or(`regenerated_at.is.null,regenerated_at.lt.\"${dayStartIso}\"`)"
    );
    expect(src).toContain(
      ".update({ regenerated_at: previous }) .eq('uid', uid) .eq('start_date', startDate) .eq('week_index', weekIndex) .eq('regenerated_at', at)"
    );
  });

  it('하루 상한은 consume_premium_quota(feature report_on_demand), 되돌리기는 release_premium_quota', () => {
    expect(src).toContain(
      ".rpc('consume_premium_quota', { p_uid: uid, p_feature: ON_DEMAND_FEATURE, })"
    );
    expect(src).toContain('parsePremiumQuota(data).allowed');
    expect(src).toContain(
      ".rpc('release_premium_quota', { p_uid: uid, p_feature: ON_DEMAND_FEATURE, })"
    );
  });

  it('config.toml: 로그인 사용자 전용(verify_jwt)', () => {
    expect(flat(read('../../../config.toml'))).toContain(
      '[functions.generate-my-report] enabled = true verify_jwt = true import_map = "./functions/generate-my-report/deno.json" entrypoint = "./functions/generate-my-report/index.ts"'
    );
  });
});

describe('20261031030000_weekly_report_regenerated_at.sql', () => {
  const sql = flat(read('../../../migrations/20261031030000_weekly_report_regenerated_at.sql'));

  it('weekly_report.regenerated_at (null 허용) 열을 더하고 스키마 캐시를 새로 읽는다', () => {
    expect(sql).toContain(
      'alter table public.weekly_report add column if not exists regenerated_at timestamptz null;'
    );
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });

  it('직접 만들기·다시 만들기 하루 상한(시도 수) 5번 설정 행을 넣는다 (있으면 그대로)', () => {
    expect(sql).toContain(
      "insert into public.premium_quota_setting (feature, daily) values ('report_on_demand', 5) on conflict (feature) do nothing;"
    );
  });
});
