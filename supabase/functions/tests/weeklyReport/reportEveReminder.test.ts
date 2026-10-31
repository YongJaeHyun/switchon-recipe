import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ReportPeriod } from '../../_shared/weeklyReportGenerate.ts';
import {
  eveReportWeekOf,
  handleReportEveReminder,
  sendReportEveReminders,
  type EveReminderNotificationRow,
  type ReportEveReminderDeps,
} from '../../report-eve-reminder/handler.ts';

// 2026-10-15(목) 20:00 KST. 내일 = 2026-10-16
const NOW = new Date('2026-10-15T11:00:00Z');
const TODAY = '2026-10-15';
const TOMORROW = '2026-10-16';

// 내일이 새 주차 1일차가 되는 시작일: 내일 − 7×k
const startFor = (week: number) =>
  new Date(Date.parse(`${TOMORROW}T00:00:00Z`) - week * 7 * 86400000).toISOString().slice(0, 10);

interface FakeDb {
  notifications: EveReminderNotificationRow[];
  sent: { uid: string; day: string }[]; // report_eve_reminder_sent (uid, day) 기본키
}

const makeDeps = (
  o: Partial<ReportEveReminderDeps> = {},
  db: FakeDb = { notifications: [], sent: [] },
  reports: Record<string, ReportPeriod[]> = {}
) => {
  const deps: ReportEveReminderDeps = {
    now: () => NOW,
    // weekly_report_candidates(내일): 1~3일차 유저가 다 온다
    // a: 내일 2주차 1일차(패스), b: 내일 1주차 끝(무료 대상), c: 내일 새 주 2일차(제외)
    fetchCandidates: vi.fn(async () => [
      { uid: 'a', start_date: startFor(1) },
      { uid: 'b', start_date: startFor(1) },
      {
        uid: 'c',
        start_date: new Date(Date.parse(`${startFor(1)}T00:00:00Z`) - 86400000)
          .toISOString()
          .slice(0, 10),
      },
    ]),
    fetchLoggedUids: vi.fn(async () => new Set<string>()),
    fetchPushableUids: vi.fn(async (uids: string[]) => new Set(uids)),
    fetchReportPeriods: vi.fn(async (uid: string) => reports[uid] ?? []),
    fetchProgramStart: vi.fn(async () => null),
    hasPremiumAccess: vi.fn(async (uid: string) => uid === 'a'),
    fetchFreeReportUsedUids: vi.fn(async () => new Set<string>()),
    fetchReportReminderOffUids: vi.fn(async () => new Set<string>()),
    claimReminders: vi.fn(async (uids: string[], day: string) => {
      await Promise.resolve();
      const claimed = new Set<string>();
      for (const uid of uids) {
        if (db.sent.some((s) => s.uid === uid && s.day === day)) continue;
        db.sent.push({ uid, day });
        claimed.add(uid);
      }
      return claimed;
    }),
    insertNotifications: vi.fn(async (rows: EveReminderNotificationRow[]) => {
      db.notifications.push(...rows);
    }),
    ...o,
  };
  return { deps, db };
};

describe('eveReportWeekOf', () => {
  it('내일이 새 주차 1일차면 끝나는 주차, 아니면 null', () => {
    expect(eveReportWeekOf(startFor(1), TODAY)).toBe(1);
    expect(eveReportWeekOf(startFor(5), TODAY)).toBe(5);
    expect(eveReportWeekOf(TOMORROW, TODAY)).toBeNull(); // 내일 시작
    expect(eveReportWeekOf(TODAY, TODAY)).toBeNull(); // 1주차 중
    expect(eveReportWeekOf('2026-10-08', TODAY)).toBeNull(); // 내일 = 2주차 2일차
    expect(eveReportWeekOf(null, TODAY)).toBeNull();
    expect(eveReportWeekOf('x', TODAY)).toBeNull();
  });

  it('시각이 붙은 옛 start_date도 날짜로 본다', () => {
    expect(eveReportWeekOf(`${startFor(2)}T09:00:00`, TODAY)).toBe(2);
  });
});

describe('sendReportEveReminders', () => {
  it('내일 1일차인 유저 중 패스 사용자·무료 1주차 대상에게 표시 주차로 보낸다', async () => {
    const { deps, db } = makeDeps();
    const result = await sendReportEveReminders(deps, TODAY);

    // 후보는 내일 08:00 실행과 같은 SQL(weekly_report_candidates(내일))로 읽는다
    expect(deps.fetchCandidates).toHaveBeenCalledWith(TOMORROW);
    expect(deps.fetchLoggedUids).toHaveBeenCalledWith(['a', 'b'], TODAY);
    expect(deps.claimReminders).toHaveBeenCalledWith(['a', 'b'], TODAY);
    expect(db.notifications).toEqual([
      {
        uid: 'a',
        title: '내일 아침 1주차 리포트가 나와요',
        body: '오늘 체중과 할 일을 기록해 두면 더 정확하게 정리해 드려요',
        href: '/home',
        channel_id: 'REPORT',
        type: 'REPORT_EVE_REMINDER',
      },
      expect.objectContaining({ uid: 'b', title: '내일 아침 1주차 리포트가 나와요' }),
    ]);
    expect(result).toMatchObject({ today: TODAY, tomorrow: TOMORROW, candidates: 2, sent: 2 });
  });

  it('리포트 알림을 끈 유저(user_setting.report_reminder = false)는 건너뛴다', async () => {
    const { deps, db } = makeDeps({
      fetchReportReminderOffUids: vi.fn(async () => new Set(['a'])),
    });
    const result = await sendReportEveReminders(deps, TODAY);
    expect(deps.fetchReportReminderOffUids).toHaveBeenCalledWith(['a', 'b']);
    expect(db.notifications.map((n) => n.uid)).toEqual(['b']);
    expect(deps.fetchReportPeriods).not.toHaveBeenCalledWith('a');
    expect(result).toMatchObject({ muted: 1, sent: 1 });
  });

  it('오늘 체중을 기록한 유저·푸시 토큰 없는 유저는 건너뛴다', async () => {
    const { deps, db } = makeDeps({
      fetchLoggedUids: vi.fn(async () => new Set(['a'])),
      fetchPushableUids: vi.fn(async (uids: string[]) => new Set(uids.filter((u) => u !== 'b'))),
    });
    const result = await sendReportEveReminders(deps, TODAY);
    expect(db.notifications).toEqual([]);
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it('패스 없는 유저는 무료 리포트를 이미 썼거나 표시 주차가 1이 아니면 보내지 않는다', async () => {
    const { deps, db } = makeDeps({
      fetchCandidates: vi.fn(async () => [
        { uid: 'b', start_date: startFor(1) }, // 무료 이미 씀
        { uid: 'd', start_date: startFor(2) }, // 2주차는 패스
        { uid: 'e', start_date: startFor(1) }, // 무료 대상
      ]),
      hasPremiumAccess: vi.fn(async () => false),
      fetchFreeReportUsedUids: vi.fn(async () => new Set(['b'])),
    });
    const result = await sendReportEveReminders(deps, TODAY);
    expect(db.notifications.map((n) => n.uid)).toEqual(['e']);
    expect(result).toMatchObject({ noAccess: 2, sent: 1 });
  });

  it('제목 주차는 표시 주차 (한 주 더 하기 뒤 새 시작일 1주차 = 실제 2주차)', async () => {
    // 옛 시작일로 1주차 리포트가 있고, 한 주 더 하기로 시작일이 7일 늦춰져 같은 기간이 (새, 1)이 됐다가
    // 그 다음 주가 끝나는 경우: (새, 1) 기간 = (옛, 2) 기간 → 겹치는 리포트 없으면 week_index + 1 규칙
    const oldStart = startFor(2);
    const { deps, db } = makeDeps(
      {
        fetchCandidates: vi.fn(async () => [{ uid: 'a', start_date: startFor(1) }]),
        // 회차 시작일(program_start)은 옛 시작일 그대로
        fetchProgramStart: vi.fn(async () => oldStart),
      },
      undefined,
      { a: [{ start_date: oldStart, week_index: 1, display_week: 1 }] }
    );
    await sendReportEveReminders(deps, TODAY);
    expect(db.notifications[0].title).toBe('내일 아침 2주차 리포트가 나와요');
  });

  it('표시 주차가 5를 넘으면(유지기 2주차 이후) 보내지 않는다', async () => {
    // 옛 시작일 기준 5주차(유지기 1주차) 리포트 뒤 한 주 더 하기로 시작일이 14일 늦춰졌다:
    // 내일 끝나는 (새 시작일, 4주차) 기간은 옛 시작일 기준 6주차 → 표시 주차 6
    const oldStart = startFor(6);
    const { deps, db } = makeDeps(
      {
        fetchCandidates: vi.fn(async () => [{ uid: 'a', start_date: startFor(4) }]),
        fetchProgramStart: vi.fn(async () => oldStart),
      },
      undefined,
      { a: [{ start_date: oldStart, week_index: 5, display_week: 5 }] }
    );
    const result = await sendReportEveReminders(deps, TODAY);
    expect(db.notifications).toEqual([]);
    expect(result.capped).toBe(1);
    expect(deps.hasPremiumAccess).not.toHaveBeenCalled();
  });

  it('5주차(유지기 1주차)까지는 보낸다', async () => {
    const { deps, db } = makeDeps({
      fetchCandidates: vi.fn(async () => [{ uid: 'a', start_date: startFor(5) }]),
    });
    await sendReportEveReminders(deps, TODAY);
    expect(db.notifications[0].title).toBe('내일 아침 5주차 리포트가 나와요');
  });

  it('같은 키의 리포트가 이미 있으면 보내지 않는다', async () => {
    const start = startFor(1);
    const { deps, db } = makeDeps(
      { fetchCandidates: vi.fn(async () => [{ uid: 'a', start_date: start }]) },
      undefined,
      { a: [{ start_date: start, week_index: 1, display_week: 1 }] }
    );
    const result = await sendReportEveReminders(deps, TODAY);
    expect(db.notifications).toEqual([]);
    expect(result.existing).toBe(1);
  });

  it('주차 맞추기로 건너뛴 기간(alignedAheadOver)이면 보내지 않는다', async () => {
    // 내일 끝나는 (새 시작일, 4주차) 기간이 가장 최근 리포트(표시 1)와 2일 겹친다
    const start = startFor(4);
    const prevStart = new Date(Date.parse(`${start}T00:00:00Z`) + 16 * 86400000)
      .toISOString()
      .slice(0, 10);
    const { deps, db } = makeDeps(
      { fetchCandidates: vi.fn(async () => [{ uid: 'a', start_date: start }]) },
      undefined,
      { a: [{ start_date: prevStart, week_index: 1, display_week: 1 }] }
    );
    const result = await sendReportEveReminders(deps, TODAY);
    expect(db.notifications).toEqual([]);
    expect(result.alignedAhead).toBe(1);
  });

  it('같은 유저가 두 번 와도(다시 시작 직전 회차 보충) 한 번만 보낸다', async () => {
    const { deps, db } = makeDeps({
      fetchCandidates: vi.fn(async () => [
        { uid: 'a', start_date: startFor(1) },
        { uid: 'a', start_date: startFor(2) },
      ]),
    });
    await sendReportEveReminders(deps, TODAY);
    expect(db.notifications.map((n) => n.uid)).toEqual(['a']);
    expect(deps.claimReminders).toHaveBeenCalledWith(['a'], TODAY);
  });

  it('같은 날 두 번(동시에) 실행해도 한 번만 보낸다', async () => {
    const { deps, db } = makeDeps();
    const [first, second] = await Promise.all([
      sendReportEveReminders(deps, TODAY),
      sendReportEveReminders(deps, TODAY),
    ]);
    expect(db.notifications.map((n) => n.uid).sort()).toEqual(['a', 'b']);
    expect(first.sent + second.sent).toBe(2);
    const third = await sendReportEveReminders(deps, TODAY);
    expect(third.sent).toBe(0);
  });

  it('한 유저 조회가 실패해도 다른 유저에게는 보낸다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps, db } = makeDeps({
      hasPremiumAccess: vi.fn(async (uid: string) => {
        if (uid === 'a') throw new Error('rpc');
        return false;
      }),
    });
    const result = await sendReportEveReminders(deps, TODAY);
    spy.mockRestore();
    expect(db.notifications.map((n) => n.uid)).toEqual(['b']);
    expect(result.failed).toBe(1);
  });

  it('후보가 없으면 아무것도 조회·저장하지 않는다', async () => {
    const { deps } = makeDeps({ fetchCandidates: vi.fn(async () => []) });
    const result = await sendReportEveReminders(deps, TODAY);
    expect(result).toMatchObject({ candidates: 0, sent: 0 });
    expect(deps.fetchLoggedUids).not.toHaveBeenCalled();
    expect(deps.insertNotifications).not.toHaveBeenCalled();
  });

  it('조회는 100명씩 나눠서 한다', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ uid: `u${i}`, start_date: startFor(1) }));
    const { deps } = makeDeps({
      fetchCandidates: vi.fn(async () => rows),
      hasPremiumAccess: vi.fn(async () => true),
    });
    const result = await sendReportEveReminders(deps, TODAY);
    expect(deps.fetchLoggedUids).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(deps.fetchLoggedUids).mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(100);
    }
    expect(result.sent).toBe(250);
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

const req = (auth: string | null, query = '') =>
  new Request(`http://localhost/report-eve-reminder${query}`, {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });

describe('handleReportEveReminder', () => {
  it('service role이 아니면 403 (today 지정도 거부)', async () => {
    const { deps } = makeDeps();
    expect((await handleReportEveReminder(req(jwt('authenticated')), deps)).status).toBe(403);
    expect(
      (await handleReportEveReminder(req(jwt('anon'), '?today=2026-10-15'), deps)).status
    ).toBe(403);
    expect((await handleReportEveReminder(req(null), deps)).status).toBe(403);
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
  });

  it('today 없이 호출하면 현재 KST 날짜, 내일 후보를 읽는다', async () => {
    const { deps } = makeDeps();
    const res = await handleReportEveReminder(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ today: TODAY, tomorrow: TOMORROW, sent: 2 });
  });

  it('?today=로 날짜를 지정할 수 있고, 잘못된 값은 400', async () => {
    const { deps } = makeDeps();
    const res = await handleReportEveReminder(req(jwt('service_role'), '?today=2026-10-31'), deps);
    expect(await res.json()).toMatchObject({ today: '2026-10-31', tomorrow: '2026-11-01' });
    expect(deps.fetchCandidates).toHaveBeenCalledWith('2026-11-01');
    expect((await handleReportEveReminder(req(jwt('service_role'), '?today=x'), deps)).status).toBe(
      400
    );
  });

  it('후보 조회 실패는 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      fetchCandidates: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const res = await handleReportEveReminder(req(jwt('service_role')), deps);
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});

// 아직 원격에 적용하지 않은 마이그레이션과 엣지 함수 연결을 글자 단위로 확인한다
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('report-eve-reminder 마이그레이션·연결', () => {
  const sql = () => flat(read('../../../migrations/20261031040000_report_eve_reminder_cron.sql'));

  it('하루 1번 막는 report_eve_reminder_sent(uid, day) 테이블 (service role 전용)', () => {
    expect(sql()).toMatch(
      /create table if not exists public\.report_eve_reminder_sent \( uid uuid not null references public\.user \(id\) on delete cascade, day date not null, created_at timestamptz not null default now\(\), primary key \(uid, day\) \);/
    );
    expect(sql()).toContain(
      'alter table public.report_eve_reminder_sent enable row level security;'
    );
    expect(sql()).toContain(
      'revoke all on table public.report_eve_reminder_sent from public, anon, authenticated;'
    );
    expect(sql()).not.toMatch(/create policy/);
  });

  it('매일 20:00 KST(11:00 UTC) cron이 Vault service role 키로 부른다', () => {
    const s = sql();
    expect(s).toContain(
      "if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then raise exception"
    );
    expect(s).toMatch(/cron\.schedule\( 'report-eve-reminder', '0 11 \* \* \*'/);
    expect(s).toContain(
      "url := 'https://hhewuyfclrapnchhltod.supabase.co/functions/v1/report-eve-reminder'"
    );
    expect(s).toContain(
      "'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')"
    );
  });

  it('7일 지난 알림·발송 기록을 매일 지운다', () => {
    const s = sql();
    expect(s).toMatch(/cron\.schedule\( 'cleanup-report-eve-reminders', '45 19 \* \* \*'/);
    expect(s).toContain(
      "delete from public.notifications where type = 'REPORT_EVE_REMINDER' and created_at < now() - interval '7 days';"
    );
    expect(s).toContain(
      "delete from public.report_eve_reminder_sent where day < (now() at time zone 'Asia/Seoul')::date - 7;"
    );
  });

  it('엣지 함수는 내일 리포트 후보 rpc와 발송 기록 테이블을 쓴다', () => {
    const src = read('../../report-eve-reminder/index.ts');
    expect(src).toContain(".rpc('weekly_report_candidates', { p_today: day })");
    expect(src).toContain(".from('report_eve_reminder_sent')");
    expect(src).toContain(".from('user_trial')");
  });

  it('배포 스크립트·config에 함수가 있다', () => {
    expect(read('../../../../scripts/deployEdgeFunctions.sh')).toContain(
      'npx supabase functions deploy report-eve-reminder'
    );
    expect(flat(read('../../../config.toml'))).toContain(
      '[functions.report-eve-reminder] enabled = true verify_jwt = true'
    );
  });
});
