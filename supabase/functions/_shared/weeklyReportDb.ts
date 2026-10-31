// 주간 리포트 한 주 만들기(_shared/weeklyReportGenerate.ts)의 실제 의존성: Supabase(service role)와 Gemini.
// cron(generate-weekly-reports)과 패스 구매 뒤 보충(verify-pass-purchase)이 같은 구현을 쓴다.
// DB는 유저 헤더가 없는 service role 클라이언트로만 접근한다. Deno 전용 (Vitest에서 로드하지 않음).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from './auth.ts';
import { fetchAllPages } from './pagination.ts';
import { createProviderAlertFetch } from './providerAlert.ts';
import { REPORT_RESPONSE_SCHEMA } from './weeklyReport.ts';
import type { NotificationRow, ReportGenerationDeps } from './weeklyReportGenerate.ts';

const GEMINI_TIMEOUT_MS = 30_000;

const redactKey = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

export type WeeklyReportDbDeps = ReportGenerationDeps & {
  // user.start_date (yyyy-MM-dd). 없으면 null
  fetchStartDate(uid: string): Promise<string | null>;
  insertNotification(row: NotificationRow): Promise<void>;
  // uids 중 리포트 알림을 끈 유저 (user_setting.report_reminder = false). 행이 없으면 켜짐.
  // 리포트 도착 푸시(cron·패스 구매 뒤 보충)와 전날 기록 알림(report-eve-reminder)이 함께 쓴다
  fetchReportReminderOffUids(uids: string[]): Promise<Set<string>>;
};

// .in() 한 번에 넣는 uid 수 (URL 길이)
const REMINDER_SETTING_CHUNK = 100;

// functionName: Gemini 장애 Slack 알림에 붙는 함수 이름 (_shared/providerAlert.ts)
export function createWeeklyReportDeps(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  functionName: string
): WeeklyReportDbDeps {
  // Gemini가 결제·키·장애로 실패하면 운영자 Slack 알림. 응답·오류 처리는 그대로다
  const providerFetch = createProviderAlertFetch({
    functionName,
    client: supabase,
    webhookUrl: Deno.env.get('SLACK_WEBHOOK_URL'),
  });

  return {
    now: () => new Date(),

    async fetchReportReminderOffUids(uids) {
      const off = new Set<string>();
      for (let i = 0; i < uids.length; i += REMINDER_SETTING_CHUNK) {
        const chunk = uids.slice(i, i + REMINDER_SETTING_CHUNK);
        const { data, error } = await supabase
          .from('user_setting')
          .select('uid')
          .in('uid', chunk)
          .eq('report_reminder', false);
        if (error) throw error;
        for (const row of (data ?? []) as { uid: string }[]) off.add(row.uid);
      }
      return off;
    },

    async fetchStartDate(uid) {
      const { data, error } = await supabase
        .from('user')
        .select('start_date')
        .eq('id', uid)
        .maybeSingle();
      if (error) throw error;
      const value = (data as { start_date?: unknown } | null)?.start_date;
      // start_date는 text 열이다 (시각이 붙은 옛 값 포함). 날짜 꼴이 아니면 없는 것으로 본다
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
        ? value.slice(0, 10)
        : null;
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

    async fetchFastingPlan(uid, startDate, weekIndex) {
      const { data, error } = await supabase
        .from('fasting_plan')
        .select('days, start_time, start_minutes')
        .eq('uid', uid)
        .eq('start_date', startDate)
        .eq('week_index', weekIndex)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            days: data.days ?? null,
            start_time: data.start_time ?? null,
            start_minutes: data.start_minutes ?? null,
          }
        : null;
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
}
