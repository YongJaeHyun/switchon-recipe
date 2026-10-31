/// <reference lib="deno.ns" />

// 리포트 직접 만들기·다시 만들기 엣지 함수 (로그인 사용자, 패스 전용): 실제 의존성(Supabase, Gemini)을 연결해
// handleGenerateMyReport를 서비스한다. 유저는 JWT로 uid만 구하고, DB·권한 rpc는 유저 헤더가 없는 service role
// 클라이언트로만 접근한다. 한 주 통계·Gemini·저장은 cron과 같은 구현 (_shared/weeklyReportDb.ts).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUid, requireEnv } from '../_shared/auth.ts';
import { createWeeklyReportDeps } from '../_shared/weeklyReportDb.ts';
import { handleGenerateMyReport, type MyReportDeps, type MyReportRow } from './handler.ts';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const exists = async (
  query: PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<boolean> => {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
};

const deps: MyReportDeps = {
  ...createWeeklyReportDeps(supabase, 'generate-my-report'),
  getUid,

  async fetchReport(uid, startDate, weekIndex) {
    const { data, error } = await supabase
      .from('weekly_report')
      .select('*')
      .eq('uid', uid)
      .eq('start_date', startDate)
      .eq('week_index', weekIndex)
      .maybeSingle();
    if (error) throw error;
    return (data as MyReportRow | null) ?? null;
  },

  // 직접 만들기 반복 악용 막기 (handler CREATE_DAILY_LIMIT)
  async countReportsCreatedSince(uid, since) {
    const { count, error } = await supabase
      .from('weekly_report')
      .select('uid', { count: 'exact', head: true })
      .eq('uid', uid)
      .gte('created_at', since.toISOString());
    if (error) throw error;
    if (typeof count !== 'number') throw new Error('weekly_report count 없음');
    return count;
  },

  // 마지막 생성 뒤 그 주 기록이 바뀌었는지: 앱이 저장할 때 보내는 updated_at으로 본다 (트리거 없음, 기기 시각).
  // 기록 삭제는 알 수 없다 (행이 없어진다)
  async recordsChangedSince({ uid, startDate, weekIndex, range }, since) {
    const results = await Promise.all([
      exists(
        supabase
          .from('weight_log')
          .select('day')
          .eq('uid', uid)
          .gte('day', range.from)
          .lte('day', range.to)
          .gt('updated_at', since)
          .limit(1)
      ),
      exists(
        supabase
          .from('todo_daily')
          .select('day')
          .eq('uid', uid)
          .gte('day', range.from)
          .lte('day', range.to)
          .gt('updated_at', since)
          .limit(1)
      ),
      exists(
        supabase
          .from('fasting_result')
          .select('day')
          .eq('uid', uid)
          .gte('day', range.from)
          .lte('day', range.to)
          .gt('updated_at', since)
          .limit(1)
      ),
      exists(
        supabase
          .from('fasting_plan')
          .select('week_index')
          .eq('uid', uid)
          .eq('start_date', startDate)
          .eq('week_index', weekIndex)
          .gt('updated_at', since)
          .limit(1)
      ),
    ]);
    return results.some(Boolean);
  },

  // 리포트(주)당 하루 1번(KST): regenerated_at이 없거나 오늘 00:00 KST 전일 때만 바꾼다 (동시 요청 중 하나만)
  async claimRegeneration(uid, startDate, weekIndex, at, dayStartIso) {
    const { data, error } = await supabase
      .from('weekly_report')
      .update({ regenerated_at: at })
      .eq('uid', uid)
      .eq('start_date', startDate)
      .eq('week_index', weekIndex)
      .or(`regenerated_at.is.null,regenerated_at.lt."${dayStartIso}"`)
      .select('uid');
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async releaseRegeneration(uid, startDate, weekIndex, at, previous) {
    const { error } = await supabase
      .from('weekly_report')
      .update({ regenerated_at: previous })
      .eq('uid', uid)
      .eq('start_date', startDate)
      .eq('week_index', weekIndex)
      .eq('regenerated_at', at);
    if (error) throw error;
  },

  async updateReport(uid, startDate, weekIndex, patch) {
    const { data, error } = await supabase
      .from('weekly_report')
      .update(patch)
      .eq('uid', uid)
      .eq('start_date', startDate)
      .eq('week_index', weekIndex)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as MyReportRow | null) ?? null;
  },
};

serve((req: Request) => handleGenerateMyReport(req, deps));
