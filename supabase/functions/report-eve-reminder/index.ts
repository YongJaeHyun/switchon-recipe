/// <reference lib="deno.ns" />

// 리포트 전날 기록 알림 엣지 함수: 매일 20:00 KST cron이 service role로 호출한다 (확인은 handler).
// 실제 의존성(Supabase)을 연결해 handleReportEveReminder를 서비스한다.
// 테스트용: ?today=yyyy-MM-dd (service role 호출만)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import { createWeeklyReportDeps } from '../_shared/weeklyReportDb.ts';
import { handleReportEveReminder, type ReportEveReminderDeps } from './handler.ts';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// 리포트 키·회차 시작일·이용 권한 조회는 generate-weekly-reports와 같은 구현 (Gemini는 쓰지 않는다)
const reportDeps = createWeeklyReportDeps(supabase, 'report-eve-reminder');

const uidSet = (rows: { uid?: string | null; id?: string | null }[] | null) =>
  new Set((rows ?? []).map((r) => r.uid ?? r.id).filter((u): u is string => !!u));

const deps: ReportEveReminderDeps = {
  now: () => new Date(),
  fetchReportPeriods: reportDeps.fetchReportPeriods,
  fetchProgramStart: reportDeps.fetchProgramStart,
  hasPremiumAccess: reportDeps.hasPremiumAccess,
  fetchReportReminderOffUids: reportDeps.fetchReportReminderOffUids,

  fetchCandidates(day) {
    // 내일 08:00 실행과 같은 후보 (service role 전용 함수, 마이그레이션 20261031000000)
    return fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .rpc('weekly_report_candidates', { p_today: day })
        .order('uid')
        .range(from, to);
      if (error) throw error;
      return (data ?? []).map((r: { uid: string; start_date: string | null }) => ({
        uid: r.uid,
        start_date: r.start_date === null ? null : String(r.start_date),
      }));
    });
  },

  async fetchLoggedUids(uids, day) {
    const { data, error } = await supabase
      .from('weight_log')
      .select('uid')
      .in('uid', uids)
      .eq('day', day);
    if (error) throw error;
    return uidSet(data);
  },

  async fetchPushableUids(uids) {
    const { data, error } = await supabase
      .from('user')
      .select('id')
      .in('id', uids)
      .not('push_token', 'is', null)
      .neq('push_token', '');
    if (error) throw error;
    return uidSet(data);
  },

  async fetchFreeReportUsedUids(uids) {
    // 무료 1주차 리포트를 쓴 유저 (마이그레이션 20261031020000_user_trial.sql). 행이 없으면 아직 안 씀
    const { data, error } = await supabase
      .from('user_trial')
      .select('uid')
      .in('uid', uids)
      .not('free_report_at', 'is', null);
    if (error) throw error;
    return uidSet(data);
  },

  async claimReminders(uids, day) {
    // on conflict (uid, day) do nothing. 새로 들어간 행만 돌려받는다
    const { data, error } = await supabase
      .from('report_eve_reminder_sent')
      .upsert(
        uids.map((uid) => ({ uid, day })),
        { onConflict: 'uid,day', ignoreDuplicates: true }
      )
      .select('uid');
    if (error) throw error;
    return uidSet(data);
  },

  async insertNotifications(rows) {
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) throw error;
  },
};

serve((req: Request) => handleReportEveReminder(req, deps));
