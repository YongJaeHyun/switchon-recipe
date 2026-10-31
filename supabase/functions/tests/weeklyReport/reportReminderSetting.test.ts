import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationRow,
  WeekData,
  WeeklyReportRow,
} from '../../_shared/weeklyReportGenerate.ts';
import {
  generateWeeklyReports,
  type GenerateReportsDeps,
} from '../../generate-weekly-reports/handler.ts';
import {
  backfillPastReports,
  type BackfillDeps,
} from '../../verify-pass-purchase/backfillReports.ts';

// 리포트 알림 끄기 (user_setting.report_reminder = false): 리포트는 그대로 만들고 도착 푸시만 보내지 않는다

const filledWeek = (day: string): WeekData => ({
  weights: [{ day, weight_kg: 70 }],
  todoDays: [{ day, items: ['물 2L'], checked: [0] }],
  fastingPlanDays: null,
  fastingPlanStartTime: null,
  fastingPlanStartMinutes: null,
  fastingResults: [],
  recipes: [],
  foodChecks: [],
});

const geminiOk = JSON.stringify({
  summary: '체중을 꾸준히 기록했어요',
  good: '체중을 꾸준히 기록했어요',
  improve: '물 마시기를 더 챙겨요',
  action: '점심에 물 한 잔을 더 마셔요',
  actionLink: null,
  weightNote: '기록을 이어가요',
  nextWeek: '다음 주도 기록해요',
});

const baseDeps = (now: Date, reports: WeeklyReportRow[], notifications: NotificationRow[]) => ({
  now: () => now,
  hasPremiumAccess: vi.fn(async () => true),
  fetchReportPeriods: vi.fn(async (uid: string) =>
    reports
      .filter((r) => r.uid === uid)
      .map((r) => ({
        start_date: r.start_date,
        week_index: r.week_index,
        display_week: r.display_week,
      }))
  ),
  fetchProgramStart: vi.fn(async () => null),
  fetchFastingPlan: vi.fn(async () => null),
  fetchWeekData: vi.fn(async (q: { range: { from: string } }) => filledWeek(q.range.from)),
  askGemini: vi.fn(async () => geminiOk),
  insertReport: vi.fn(async (row: WeeklyReportRow) => {
    reports.push(row);
    return true;
  }),
  insertNotification: vi.fn(async (row: NotificationRow) => {
    notifications.push(row);
  }),
});

describe('generate-weekly-reports: 리포트 알림을 끈 유저', () => {
  // 2026-10-15(목) 08:00 KST
  const NOW = new Date('2026-10-14T23:00:00Z');
  const TODAY = '2026-10-15';

  const makeDeps = (o: Partial<GenerateReportsDeps> = {}) => {
    const reports: WeeklyReportRow[] = [];
    const notifications: NotificationRow[] = [];
    const deps: GenerateReportsDeps = {
      ...baseDeps(NOW, reports, notifications),
      fetchUsers: vi.fn(async () => [
        { id: 'on', start_date: '2026-10-08' },
        { id: 'off', start_date: '2026-10-08' },
        { id: 'free', start_date: '2026-10-08' },
      ]),
      hasPremiumAccess: vi.fn(async (uid: string) => uid !== 'free'),
      claimFreeReport: vi.fn(async () => true),
      releaseFreeReport: vi.fn(async () => {}),
      fetchReportReminderOffUids: vi.fn(async () => new Set(['off', 'free'])),
      ...o,
    };
    return { deps, reports, notifications };
  };

  it('리포트는 만들고 도착 푸시(무료 1주차 포함)는 보내지 않는다. 설정은 한 번에 읽는다', async () => {
    const { deps, reports, notifications } = makeDeps();
    const result = await generateWeeklyReports(deps, TODAY);

    expect(reports.map((r) => r.uid).sort()).toEqual(['free', 'off', 'on']);
    expect(notifications.map((n) => n.uid)).toEqual(['on']);
    expect(deps.fetchReportReminderOffUids).toHaveBeenCalledTimes(1);
    expect(deps.fetchReportReminderOffUids).toHaveBeenCalledWith(['on', 'off', 'free']);
    expect(result).toMatchObject({ generated: 3, trial: 1, notified: 1, muted: 2, failed: 0 });
  });

  it('후보가 없으면 설정을 읽지 않는다', async () => {
    const { deps } = makeDeps({ fetchUsers: vi.fn(async () => []) });
    await generateWeeklyReports(deps, TODAY);
    expect(deps.fetchReportReminderOffUids).not.toHaveBeenCalled();
  });

  it('설정을 못 읽으면 실행이 실패한다 (08:30 재시도가 다시 만든다, 리포트·푸시 없음)', async () => {
    const { deps, reports } = makeDeps({
      fetchReportReminderOffUids: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    await expect(generateWeeklyReports(deps, TODAY)).rejects.toThrow('db');
    expect(reports).toEqual([]);
  });
});

describe('패스 구매 뒤 보충: 리포트 알림을 끈 유저', () => {
  const START = '2026-10-01';
  const NOW = new Date('2026-10-09T00:00:00Z'); // 2주차

  const makeDeps = (o: Partial<BackfillDeps> = {}) => {
    const reports: WeeklyReportRow[] = [];
    const notifications: NotificationRow[] = [];
    const deps: BackfillDeps = {
      ...baseDeps(NOW, reports, notifications),
      fetchStartDate: vi.fn(async () => START),
      countReportsCreatedSince: vi.fn(async () => 0),
      fetchReportReminderOffUids: vi.fn(async (uids: string[]) => new Set(uids)),
      ...o,
    };
    return { deps, reports, notifications };
  };

  it('리포트는 만들고 푸시는 보내지 않는다', async () => {
    const { deps, reports, notifications } = makeDeps();
    const result = await backfillPastReports(deps, 'user-1');
    expect(reports).toHaveLength(1);
    expect(notifications).toEqual([]);
    expect(deps.fetchReportReminderOffUids).toHaveBeenCalledWith(['user-1']);
    expect(result).toMatchObject({ created: [1], notified: false, failed: 0 });
  });

  it('켠 유저는 푸시한다', async () => {
    const { deps, notifications } = makeDeps({
      fetchReportReminderOffUids: vi.fn(async () => new Set<string>()),
    });
    await backfillPastReports(deps, 'user-1');
    expect(notifications).toHaveLength(1);
  });

  it('설정을 못 읽으면 푸시하지 않고 실패로 센다 (리포트는 남는다)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, reports, notifications } = makeDeps({
      fetchReportReminderOffUids: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const result = await backfillPastReports(deps, 'user-1');
    spy.mockRestore();
    expect(reports).toHaveLength(1);
    expect(notifications).toEqual([]);
    expect(result).toMatchObject({ notified: false, failed: 1 });
  });
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('user_setting.report_reminder 마이그레이션·연결', () => {
  it('기본 켜짐 열을 더한다 (행 없는 유저도 켜짐)', () => {
    const sql = flat(read('../../../migrations/20261031050000_user_setting_report_reminder.sql'));
    expect(sql).toContain(
      'alter table public.user_setting add column if not exists report_reminder boolean not null default true;'
    );
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });

  it('DB 구현은 끈 유저만 100명씩 읽고, 세 함수 모두 같은 구현을 쓴다', () => {
    const db = flat(read('../../_shared/weeklyReportDb.ts'));
    expect(db).toMatch(
      /async fetchReportReminderOffUids\(uids\) \{[\s\S]*\.from\('user_setting'\) \.select\('uid'\) \.in\('uid', chunk\) \.eq\('report_reminder', false\)/
    );
    expect(read('../../generate-weekly-reports/index.ts')).toContain('...reportDeps');
    expect(read('../../verify-pass-purchase/index.ts')).toContain(
      "...createWeeklyReportDeps(supabase, 'verify-pass-purchase')"
    );
    expect(read('../../report-eve-reminder/index.ts')).toContain(
      'fetchReportReminderOffUids: reportDeps.fetchReportReminderOffUids'
    );
  });
});
