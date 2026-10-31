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
import { createProviderAlertFetch } from '../_shared/providerAlert.ts';
import { REPORT_RESPONSE_SCHEMA } from '../_shared/weeklyReport.ts';
import {
  handleGenerateWeeklyReports,
  type GenerateReportsDeps,
  type ReportUserRow,
} from './handler.ts';

const GEMINI_TIMEOUT_MS = 30_000;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

// Gemini가 결제·키·장애로 실패하면 운영자 Slack 알림 (_shared/providerAlert.ts). 응답·오류 처리는 그대로다
const providerFetch = createProviderAlertFetch({
  functionName: 'generate-weekly-reports',
  client: supabase,
  webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
});

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const deps: GenerateReportsDeps = {
  now: () => new Date(),

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

  async hasPremiumAccess(uid) {
    const { data, error } = await supabase.rpc('has_premium_access_for', { p_uid: uid });
    if (error) throw error;
    return data === true;
  },

  fetchReportPeriods(uid) {
    return fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('weekly_report')
        .select('start_date, week_index, display_week')
        .eq('uid', uid)
        .order('start_date')
        .order('week_index')
        .range(from, to);
      if (error) throw error;
      return (data ?? []).map(
        (r: { start_date: string; week_index: number; display_week: number | null }) => ({
          start_date: String(r.start_date),
          week_index: Number(r.week_index),
          // 마이그레이션 전 행은 null → handler가 week_index로 본다
          display_week: typeof r.display_week === 'number' ? r.display_week : null,
        })
      );
    });
  },

  async fetchProgramStart(uid) {
    const { data, error } = await supabase
      .from('user')
      .select('program_start')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    const value = (data as { program_start?: unknown } | null)?.program_start;
    return typeof value === 'string' ? value : null;
  },

  async fetchWeekData({ uid, startDate, weekIndex, baselineStart, range, fromIso, toIso }) {
    const [weights, todoDays, plan, fastingResults, recipes, foodChecks] = await Promise.all([
      fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('weight_log')
          .select('day, weight_kg')
          .eq('uid', uid)
          .gte('day', baselineStart)
          .lte('day', range.to)
          .order('day')
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      }),
      supabase
        .from('todo_daily')
        .select('day, items, checked')
        .eq('uid', uid)
        .gte('day', range.from)
        .lte('day', range.to),
      supabase
        .from('fasting_plan')
        .select('days, start_time, start_minutes')
        .eq('uid', uid)
        .eq('start_date', startDate)
        .eq('week_index', weekIndex)
        .maybeSingle(),
      supabase
        .from('fasting_result')
        .select('day, result, fasted_minutes')
        .eq('uid', uid)
        .gte('day', range.from)
        .lte('day', range.to),
      fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('recipe')
          .select('created_at, is_zero_carb')
          .eq('uid', uid)
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('id')
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      }),
      fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('food_check')
          .select('created_at, verdict')
          .eq('uid', uid)
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('id')
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      }),
    ]);
    for (const res of [todoDays, plan, fastingResults]) {
      if (res.error) throw res.error;
    }
    return {
      weights,
      todoDays: todoDays.data ?? [],
      fastingPlanDays: plan.data?.days ?? null,
      fastingPlanStartTime: plan.data?.start_time ?? null,
      fastingPlanStartMinutes: plan.data?.start_minutes ?? null,
      fastingResults: fastingResults.data ?? [],
      recipes,
      foodChecks,
    };
  },

  async askGemini(prompt) {
    const geminiKey = requireEnv('GEMINI_API_KEY');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await providerFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: REPORT_RESPONSE_SCHEMA,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: controller.signal,
        }
      );
      if (!res.ok) {
        throw new Error(`Gemini 호출 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
      }
      const data = await res.json();
      return (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: unknown }) => (typeof p.text === 'string' ? p.text : ''))
        .join('');
    } catch (error) {
      throw new Error(redactKey(error instanceof Error ? error.message : String(error)));
    } finally {
      clearTimeout(timer);
    }
  },

  async insertReport(row) {
    // on conflict (uid, start_date, week_index) do nothing. 새로 들어간 행만 돌려받는다
    const { data, error } = await supabase
      .from('weekly_report')
      .upsert(row, { onConflict: 'uid,start_date,week_index', ignoreDuplicates: true })
      .select('uid');
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async insertNotification(row) {
    const { error } = await supabase.from('notifications').insert(row);
    if (error) throw error;
  },
};

serve((req: Request) => handleGenerateWeeklyReports(req, deps));
