/// <reference lib="deno.ns" />

// 체중 기록 알림 엣지 함수: 매일 09:00 KST cron이 service role로 호출한다 (확인은 handler).
// 실제 의존성(Supabase)을 연결해 handleWeightReminder를 서비스한다.
// 테스트용: ?today=yyyy-MM-dd (service role 호출만)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import { fetchAllPages } from '../_shared/pagination.ts';
import { handleWeightReminder, type WeightReminderDeps } from './handler.ts';

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const uidSet = (rows: { uid?: string | null; id?: string | null }[] | null) =>
  new Set((rows ?? []).map((r) => r.uid ?? r.id).filter((u): u is string => !!u));

const deps: WeightReminderDeps = {
  now: () => new Date(),

  async fetchReminderUids() {
    const rows = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('user_setting')
        .select('uid')
        .eq('weight_reminder', true)
        .order('uid')
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });
    return rows.map((r) => r.uid);
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

  async claimReminders(uids, day) {
    // on conflict (uid, day) do nothing. 새로 들어간 행만 돌려받는다
    const { data, error } = await supabase
      .from('weight_reminder_sent')
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

serve((req: Request) => handleWeightReminder(req, deps));
