import { describe, expect, it, vi } from 'vitest';
import {
  handleWeightReminder,
  sendWeightReminders,
  type ReminderNotificationRow,
  type WeightReminderDeps,
} from '../../weight-reminder/handler.ts';

// 2026-10-15(목) 09:00 KST
const NOW = new Date('2026-10-15T00:00:00Z');
const TODAY = '2026-10-15';

interface FakeDb {
  notifications: (ReminderNotificationRow & { created_at: string })[];
  sent: { uid: string; day: string }[]; // weight_reminder_sent (uid, day) 기본키
}

const makeDeps = (
  o: Partial<WeightReminderDeps> = {},
  db: FakeDb = { notifications: [], sent: [] }
) => {
  const deps: WeightReminderDeps = {
    now: () => NOW,
    // 알림 켠 유저: a(대상), b(오늘 기록함), c(푸시 토큰 없음), d(대상)
    fetchReminderUids: vi.fn(async () => ['a', 'b', 'c', 'd']),
    fetchLoggedUids: vi.fn(async (uids: string[]) => new Set(uids.filter((u) => u === 'b'))),
    fetchPushableUids: vi.fn(async (uids: string[]) => new Set(uids.filter((u) => u !== 'c'))),
    // insert ... on conflict (uid, day) do nothing returning uid. 동시에 불려도 한 번만 들어간다
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
    insertNotifications: vi.fn(async (rows: ReminderNotificationRow[]) => {
      db.notifications.push(...rows.map((r) => ({ ...r, created_at: NOW.toISOString() })));
    }),
    ...o,
  };
  return { deps, db };
};

describe('sendWeightReminders', () => {
  it('알림 켠 유저 중 오늘 기록 없고 토큰 있는 유저에게만 보낸다', async () => {
    const { deps, db } = makeDeps();
    const result = await sendWeightReminders(deps, TODAY);

    expect(deps.fetchLoggedUids).toHaveBeenCalledWith(['a', 'b', 'c', 'd'], TODAY);
    expect(deps.claimReminders).toHaveBeenCalledWith(['a', 'd'], TODAY);
    expect(db.notifications.map((n) => n.uid)).toEqual(['a', 'd']);
    expect(db.notifications[0]).toEqual({
      uid: 'a',
      title: '오늘 체중을 기록해볼까요?',
      body: expect.any(String),
      href: '/weight',
      channel_id: 'REPORT',
      type: 'WEIGHT_REMINDER',
      created_at: expect.any(String),
    });
    expect(result).toEqual({ today: TODAY, enabled: 4, sent: 2 });
  });

  it('알림 켠 유저가 없으면 아무것도 조회·저장하지 않는다', async () => {
    const { deps } = makeDeps({ fetchReminderUids: vi.fn(async () => []) });
    expect(await sendWeightReminders(deps, TODAY)).toEqual({ today: TODAY, enabled: 0, sent: 0 });
    expect(deps.fetchLoggedUids).not.toHaveBeenCalled();
    expect(deps.insertNotifications).not.toHaveBeenCalled();
  });

  it('같은 날 두 번 실행해도 한 번만 보낸다', async () => {
    const { deps, db } = makeDeps();
    await sendWeightReminders(deps, TODAY);
    const second = await sendWeightReminders(deps, TODAY);
    expect(db.notifications).toHaveLength(2);
    expect(second.sent).toBe(0);
  });

  it('같은 날 동시에 두 번 실행돼도 한 번만 보낸다 (리뷰 M4)', async () => {
    const { deps, db } = makeDeps();
    const [first, second] = await Promise.all([
      sendWeightReminders(deps, TODAY),
      sendWeightReminders(deps, TODAY),
    ]);
    expect(db.notifications.map((n) => n.uid).sort()).toEqual(['a', 'd']);
    expect(first.sent + second.sent).toBe(2);
  });

  it('어제 보낸 알림은 오늘 발송을 막지 않는다', async () => {
    const db: FakeDb = { notifications: [], sent: [{ uid: 'a', day: '2026-10-14' }] };
    const { deps } = makeDeps({}, db);
    expect((await sendWeightReminders(deps, TODAY)).sent).toBe(2);
  });

  it('조회는 100명씩 나눠서 한다', async () => {
    const uids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const { deps } = makeDeps({ fetchReminderUids: vi.fn(async () => uids) });
    const result = await sendWeightReminders(deps, TODAY);
    expect(deps.fetchLoggedUids).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(deps.fetchLoggedUids).mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(100);
    }
    expect(result.sent).toBe(250);
  });
});

const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

const req = (auth: string | null, query = '') =>
  new Request(`http://localhost/weight-reminder${query}`, {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
  });

describe('handleWeightReminder', () => {
  it('service role이 아니면 403 (today 지정도 거부)', async () => {
    const { deps } = makeDeps();
    expect((await handleWeightReminder(req(jwt('authenticated')), deps)).status).toBe(403);
    expect((await handleWeightReminder(req(jwt('anon'), '?today=2026-10-15'), deps)).status).toBe(
      403
    );
    expect((await handleWeightReminder(req(null), deps)).status).toBe(403);
    expect(deps.fetchReminderUids).not.toHaveBeenCalled();
  });

  it('today 없이 호출하면 현재 KST 날짜', async () => {
    const { deps } = makeDeps({ now: () => new Date('2026-10-14T15:00:00Z') });
    const res = await handleWeightReminder(req(jwt('service_role')), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ today: '2026-10-15', enabled: 4, sent: 2 });
  });

  it('service role은 ?today=로 날짜를 지정할 수 있고, 잘못된 값은 400', async () => {
    const { deps } = makeDeps();
    const res = await handleWeightReminder(req(jwt('service_role'), '?today=2026-10-20'), deps);
    expect(await res.json()).toMatchObject({ today: '2026-10-20' });
    expect(deps.fetchLoggedUids).toHaveBeenCalledWith(expect.any(Array), '2026-10-20');
    expect((await handleWeightReminder(req(jwt('service_role'), '?today=x'), deps)).status).toBe(
      400
    );
  });

  it('조회 실패는 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      fetchReminderUids: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    const res = await handleWeightReminder(req(jwt('service_role')), deps);
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});
