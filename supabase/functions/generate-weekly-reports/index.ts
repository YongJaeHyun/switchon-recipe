/// <reference lib="deno.ns" />

// 주간 리포트 생성 엣지 함수: 매일 08:00 KST cron이 service role로 호출한다 (확인은 handler).
// 실제 의존성(Supabase, Gemini)을 연결해 handleGenerateWeeklyReports를 서비스한다.
// DB는 유저 헤더가 없는 service role 클라이언트로만 접근한다.
// 테스트용: ?today=yyyy-MM-dd (service role 호출만)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import { REPORT_RESPONSE_SCHEMA } from '../_shared/weeklyReport.ts';
import {
  handleGenerateWeeklyReports,
  type GenerateReportsDeps,
  type ReportUserRow,
} from './handler.ts';

const GEMINI_TIMEOUT_MS = 30_000;

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const deps: GenerateReportsDeps = {
  now: () => new Date(),

  fetchUsers(today) {
    return fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('user')
        .select('id, start_date')
        .not('start_date', 'is', null)
        .lt('start_date', today)
        .order('id')
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as ReportUserRow[];
    });
  },

  async hasPremiumAccess(uid) {
    const { data, error } = await supabase.rpc('has_premium_access_for', { p_uid: uid });
    if (error) throw error;
    return data === true;
  },

  async reportExists(uid, startDate, weekIndex) {
    const { data, error } = await supabase
      .from('weekly_report')
      .select('uid')
      .eq('uid', uid)
      .eq('start_date', startDate)
      .eq('week_index', weekIndex)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  },

  async fetchWeekData({ uid, startDate, weekIndex, range, fromIso, toIso }) {
    const [weights, todoDays, plan, fastingResults, recipes, foodChecks] = await Promise.all([
      fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('weight_log')
          .select('day, weight_kg')
          .eq('uid', uid)
          .gte('day', startDate)
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
        .select('days')
        .eq('uid', uid)
        .eq('start_date', startDate)
        .eq('week_index', weekIndex)
        .maybeSingle(),
      supabase
        .from('fasting_result')
        .select('day, result')
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
      const res = await fetch(
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
