/// <reference lib="deno.ns" />

// 주간 리포트 생성 엣지 함수: 매일 08:00 KST cron이 service role로 호출한다 (확인은 handler).
// 새 주차 1일차에 놓친 리포트는 2·3일차 실행이 보충한다.
// 실제 의존성(Supabase, Gemini)을 연결해 handleGenerateWeeklyReports를 서비스한다.
// DB는 유저 헤더가 없는 service role 클라이언트로만 접근한다.
// 테스트용: ?today=yyyy-MM-dd (service role 호출만)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import { createWeeklyReportDeps } from '../_shared/weeklyReportDb.ts';
import {
  handleGenerateWeeklyReports,
  type GenerateReportsDeps,
  type ReportUserRow,
} from './handler.ts';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// 한 주 만들기에 쓰는 DB·Gemini 구현은 verify-pass-purchase(지난 주 보충)와 같다 (_shared/weeklyReportDb.ts)
const reportDeps = createWeeklyReportDeps(supabase, 'generate-weekly-reports');

const deps: GenerateReportsDeps = {
  ...reportDeps,

  // 무료 1주차 리포트 (사용자당 평생 1번, service role 전용 함수. 마이그레이션 20261031020000_user_trial.sql)
  async claimFreeReport(uid) {
    const { data, error } = await supabase.rpc('claim_free_report', { p_uid: uid });
    if (error) throw error;
    return data === true;
  },

  async releaseFreeReport(uid) {
    const { error } = await supabase.rpc('release_free_report', { p_uid: uid });
    if (error) throw error;
  },

  fetchUsers(today) {
    // 오늘이 새 주차 1~3일차인 유저만 SQL에서 거른다 (service role 전용 함수).
    // 다시 시작 직전 회차의 마지막 완료 주는 옛 시작일 행으로 함께 온다 (20261031000000 마이그레이션)
    return fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .rpc('weekly_report_candidates', { p_today: today })
        .order('uid')
        .range(from, to);
      if (error) throw error;
      return (data ?? []).map(
        (r: { uid: string; start_date: string }): ReportUserRow => ({
          id: r.uid,
          start_date: r.start_date,
        })
      );
    });
  },
};

serve((req: Request) => handleGenerateWeeklyReports(req, deps));
